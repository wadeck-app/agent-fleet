import type { InteractivityPolicyProvider, StepPlacement } from 'extension-points';
import { buildSubStepFeedback } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_SECRETS, WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { BoundStepRouting } from './BoundStepWait.js';
import type { DaemonSecrets } from './DaemonSecrets.js';
import { DispatchLookups } from './DispatchLookups.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import { HostToolRouting } from './HostToolRouting.js';
import { ReRunKindTracker } from './ReRunKindTracker.js';
import type { ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { RequirementShortage } from './RequirementShortage.js';
import { StepPlacementBuilder } from './StepPlacementBuilder.js';
import { StepRouter } from './StepRouter.js';
import type { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import type { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import type { GuaranteeLookup, RequirementOnlyLookup } from './WorkerTypeCatalog.js';

/** The most workers named in the hint about requirement-only sources. */
const MAX_REQUIREMENT_ONLY_WORKERS_NAMED = 5;

/** Hands queued steps to the idle workers that may run them. */
export class StepDispatcher {
	/** Chooses which live worker a step goes to (S3, S4), after the requirement and requirement-only filters */
	private readonly router: StepRouter;
	/** Keeps a step with hostTools off the workers that do not declare the feature, and fails it when only those remain */
	private readonly hostToolRouting: HostToolRouting;
	/** Describes a step for routing (labels, shell, project, requirements) */
	private readonly placements: StepPlacementBuilder;
	/** Decides the fate of a step with requirements that found no idle worker; absent when the daemon wired no declared guarantees */
	private readonly shortage: RequirementShortage | undefined;
	/** What is read from the declared sources, answering the safe way when they cannot be read */
	private readonly lookups: DispatchLookups;
	/** Tells a retry from another re-run when a step starts again, for the attempt history */
	private readonly reRunKinds = new ReRunKindTracker();
	/** When each interactive step started waiting, so an S9 policy can bound its own wait */
	private readonly interactiveWaitSince = new Map<string, number>();

	/**
	 * @param failStep Fails a step the daemon itself decided cannot proceed.
	 * @param interactivityPolicy S9 policy deciding the fate of a step needing a human (D#39).
	 * @param routing Where the requirement-only sources and guarantees come from, how long a step waits for a worker that meets its requirements, and where the contact
	 *        failures of the sources are kept (see {@link BoundStepRouting}).
	 */
	constructor(
		private readonly registry: WorkerRegistry,
		private readonly queue: ReadyStepQueue,
		private readonly executions: ExecutionRegistry,
		private readonly supervisor: WorkerAssignmentSupervisor,
		private readonly demand: UnmetDemandCoverage,
		private readonly daemonSecrets: DaemonSecrets,
		private readonly executionStore: ExecutionStore,
		private readonly hooks: ExecutionHooks,
		private readonly logWriter: LogWriter,
		private readonly interactivityPolicy: InteractivityPolicyProvider,
		private readonly failStep: (executionId: string, stepId: string, reason: string) => void,
		private readonly routing: BoundStepRouting
	) {
		this.router = new StepRouter(undefined, undefined, routing.workerTypes);
		this.hostToolRouting = new HostToolRouting(this.router);
		this.placements = new StepPlacementBuilder(executions);
		this.lookups = new DispatchLookups(routing.workerTypes, logWriter);
		this.shortage =
			routing.declaredGuarantees === undefined
				? undefined
				: new RequirementShortage(this.router, routing.declaredGuarantees, routing.wait, routing.contactErrors);
	}

	/** `executionId:stepId` of the steps already told that requirement-only workers are connected but do not take them. */
	private readonly requirementOnlyHintReported = new Set<string>();

	/** Drops the timers of the steps waiting for a worker that meets their requirements, for the daemon stop. */
	stop(): void {
		this.routing.wait.stop();
	}

	/** Forgets the waits of an execution that is over. */
	forgetExecution(executionId: string): void {
		this.routing.wait.forgetExecution(executionId);
		this.lookups.forgetExecution(executionId);
		for (const key of [...this.requirementOnlyHintReported]) {
			if (key.startsWith(`${executionId}:`)) {
				this.requirementOnlyHintReported.delete(key);
			}
		}
		for (const key of this.interactiveWaitSince.keys()) {
			if (key.startsWith(`${executionId}:`)) {
				this.interactiveWaitSince.delete(key);
			}
		}
	}

	/**
	 * Hands out as many queued steps as current capacity allows.
	 *
	 * Every queued step is considered, not just the head: which workers may run a step now
	 * depends on the step (labels, project, interactivity), so stopping at the first
	 * unplaceable one would let a single unsatisfiable label stall independent work behind
	 * it. Steps that find no worker keep their place in the queue.
	 */
	tryDispatch(): void {
		/** Steps nothing could run this pass, put back in order once the pass ends. */
		const unplaced: ReadyStep[] = [];
		/** How many of them a host worker could have run: steps with requirements are not demand for one. */
		let unplacedForHost = 0;
		/** Declared sources that can provide what the unplaced steps with requirements wait for. */
		const waitingForSources = new Set<string>();
		/** Read at most once per pass, and only if a step that requires nothing needs it. */
		let requirementOnlyOfPass: RequirementOnlyLookup | undefined;
		/** Read at most once per pass, and only if a step with requirements needs it. */
		let guaranteesOfPass: GuaranteeLookup | undefined;

		while (this.queue.length > 0) {
			const step = this.queue.shift()!;

			// Purging happens once, when the run fails; a step re-queued later (a worker lost
			// after the cleanup) must not be handed out for an execution that no longer exists.
			if (!this.executions.isActive(step.executionContext.executionId)) {
				this.logWriter.writeExecution(
					step.executionContext.executionId,
					`Step ${step.stepId} dropped from the queue: its execution is already over`,
					'info'
				);
				continue;
			}

			let placement: StepPlacement;
			try {
				placement = this.placements.describe(step);
			} catch (err) {
				// A step whose routing cannot even be described is never placeable, so
				// leaving it queued would stall the flow with no explanation.
				this.failStep(step.executionContext.executionId, step.stepId, normalizeError(err).message);
				continue;
			}

			// Read at most once per pass, and only for a step that requires nothing.
			const requirementOnly =
				placement.requires === undefined
					? (requirementOnlyOfPass ??= this.lookups.requirementOnlyLookup(step.executionContext.executionId))
					: undefined;
			// Read at most once per pass, and only for a step that requires something.
			const guarantees =
				placement.requires === undefined
					? undefined
					: (guaranteesOfPass ??= this.lookups.guaranteeLookup(step.executionContext.executionId));
			const needsHostTools = HostToolRouting.isRequiredBy(step);
			const idle = needsHostTools ? HostToolRouting.capable(this.registry.listIdle()) : this.registry.listIdle();
			const idleWorker = this.router.select(placement, idle, requirementOnly, guarantees);
			if (idleWorker === undefined && needsHostTools) {
				const refusal = this.hostToolRouting.refusal(
					step,
					placement,
					this.registry.listConnections(),
					requirementOnly,
					guarantees
				);
				if (refusal !== undefined) {
					this.failStep(step.executionContext.executionId, step.stepId, refusal);
					continue;
				}
			}
			if (idleWorker === undefined && placement.requiresUserInterface && this.failIfNobodyCanAnswer(step)) {
				continue;
			}
			/** The declared sources worth asking for a worker, for a step that waits for a requirement. */
			let sourcesToAsk: ReadonlySet<string> = new Set();
			if (idleWorker === undefined && guarantees !== undefined) {
				const assessed = this.assessShortage(step, placement, guarantees);
				if (assessed === undefined) {
					continue;
				}
				sourcesToAsk = assessed;
			}
			if (idleWorker) {
				if (placement.requires !== undefined) {
					this.routing.wait.clearRequirement(step.executionContext.executionId, step.stepId);
				}
				this.dispatchTo(idleWorker, step, placement.requires);
			} else {
				if (requirementOnly !== undefined) {
					this.hintAboutRequirementOnlyWorkers(step, placement, requirementOnly);
				}
				unplaced.push(step);
				for (const sourceId of sourcesToAsk) {
					waitingForSources.add(sourceId);
				}
				if (placement.requires === undefined) {
					unplacedForHost++;
				}
			}
		}

		this.queue.unshift(...unplaced);
		this.demand.cover(unplacedForHost, waitingForSources);
	}

	private dispatchTo(idleWorker: WebSocket, step: ReadyStep, requires: string[] | undefined): void {
		const scheduler = this.executions.scheduler(step.executionContext.executionId);

		// Before dispatching, sync sub-step errors and sub-step outputs from the scheduler
		// into ExecutionContext so the worker can render ${{ context.lastSubStepError }},
		// ${{ subSteps.stepId.outputs.stderr }}, and {% if subSteps.stepId.status.failed %}
		if (scheduler) {
			const errors = scheduler.getSubStepErrors(step.stepId);
			if (errors.length > 0) {
				if (!step.executionContext.subStepErrors) {
					step.executionContext.subStepErrors = {};
				}
				step.executionContext.subStepErrors[step.stepId] = errors;
			}
			const subStepsMap = scheduler.getSubSteps();
			if (subStepsMap && subStepsMap.size > 0) {
				step.executionContext.subSteps = Object.fromEntries(subStepsMap);
				step.executionContext.subStepFeedback = buildSubStepFeedback(subStepsMap);
			}
		}

		// A parent re-queued because a sub-step failed continues its own session with just
		// the feedback. Decided per assignment from the scheduler: `subSteps` above is
		// execution-wide and reaches unrelated steps, so it cannot tell which one this is.
		const relaunchFeedback = scheduler?.getSubStepRelaunchFeedback(step.stepId);
		const stepSecrets = this.daemonSecrets.valuesForStep(step.executionContext.executionId, step.stepId);
		if (stepSecrets !== undefined && !this.workerSupportsSecrets(idleWorker)) {
			this.failStep(
				step.executionContext.executionId,
				step.stepId,
				this.describeWorkerWithoutSecrets(step.stepId, Object.keys(stepSecrets), idleWorker)
			);
			return;
		}
		const sessionContext =
			relaunchFeedback === undefined
				? step.executionContext
				: { ...step.executionContext, subStepRelaunch: { feedback: relaunchFeedback } };
		// Per assignment, never on the shared context: only the step that uses a secret gets it.
		const executionContext =
			stepSecrets === undefined ? sessionContext : { ...sessionContext, secrets: stepSecrets };
		if (relaunchFeedback !== undefined) {
			this.warnIfWorkerCannotResume(step, idleWorker);
		}

		this.registry.markBusy(idleWorker);
		// Acknowledge: marks step as in-flight in scheduler to prevent double-dispatch
		scheduler?.acknowledge(step.stepId);
		// Provenance recorded at dispatch: this is the only moment both the source
		// and the worker identity are known (T-06).
		const worker = this.registry.describe(idleWorker);
		this.executionStore.markStepRunning(
			step.executionContext.executionId,
			step.stepId,
			{ sourceId: worker?.sourceId, workerId: worker?.workerId },
			relaunchFeedback,
			this.reRunKinds.kindFor(scheduler, step.stepId)
		);
		this.hooks.dispatch(step.executionContext.executionId, 'onStepStart', {
			executionId: step.executionContext.executionId,
			stepId: step.stepId,
		});

		// Kept by the supervisor so a disconnect can re-send this exact payload (D#62).
		const assignmentId = this.supervisor.issue(idleWorker, step);
		const sent = this.registry.send(idleWorker, {
			type: 'assign',
			assignmentId,
			stepId: step.stepId,
			stepConfig: step.stepConfig,
			executionContext,
			...(requires === undefined ? {} : { requires }),
			// Only the literal boolean on a script step counts; the validator and the injection guard already refused the rest.
			...(step.stepConfig.type === 'script' && step.stepConfig.host === true ? { host: true as const } : {}),
		});
		if (sent) {
			this.supervisor.watchHandedOver(assignmentId);
			return;
		}
		// Never handed over, so the assignment must not stay outstanding.
		this.supervisor.discardUnsent(assignmentId);
		// Worker disconnected between getIdleWorker() and send - re-queue the step
		this.registry.remove(idleWorker);
		// Transport failure: not a flow-level failure - unacknowledge and put back
		scheduler?.unacknowledge(step.stepId);
		this.queue.unshift(step);
	}

	private workerSupportsSecrets(worker: WebSocket): boolean {
		return this.registry.describe(worker)?.features.includes(WORKER_FEATURE_SECRETS) === true;
	}

	private describeWorkerWithoutSecrets(stepId: string, secretNames: string[], worker: WebSocket): string {
		const registered = this.registry.describe(worker);
		return (
			`Step '${stepId}' uses secret(s) ${secretNames.join(', ')} but worker ${registered?.workerId ?? 'unknown'} ` +
			`(flow-cli ${registered?.version ?? 'unknown version'}) does not support secrets and would run it with the ` +
			`variable missing. Update flow-cli on that worker (\`flow cli update\`) and restart it.`
		);
	}

	/**
	 * Names, in the execution log, a worker that cannot resume the parent's session.
	 *
	 * Such a worker (built before `WORKER_FEATURE_SUB_STEP_SESSION_RESUME`) ignores the relaunch
	 * payload and renders the parent's whole prompt again, which is the previous behaviour. It is
	 * allowed to run the step -- routing is an extension point and refusing would stall a flow in
	 * the middle of a rolling worker update -- but never silently.
	 */
	private warnIfWorkerCannotResume(step: ReadyStep, worker: WebSocket): void {
		const registered = this.registry.describe(worker);
		if (registered?.features.includes(WORKER_FEATURE_SUB_STEP_SESSION_RESUME) === true) {
			return;
		}
		this.logWriter.writeExecution(
			step.executionContext.executionId,
			`Step '${step.stepId}' is re-run because a sub-step failed, but worker ${registered?.workerId ?? 'unknown'} (flow-cli ${registered?.version ?? 'unknown version'}) cannot resume its session: it will render the step's prompt again from scratch instead of receiving only the sub-step feedback. Update flow-cli on that worker (\`flow cli update\`) and restart it to get the session-resume behaviour.`,
			'warning'
		);
	}

	/**
	 * Asks S9 what to do about a step needing a human that nothing can host (D#39, D#61).
	 *
	 * Kept out of the provisioning path on purpose: no amount of provisioning helps here. A
	 * forked worker has no terminal, so the daemon cannot create its way out of this, and
	 * treating it as ordinary unmet demand would leave the step queued forever.
	 *
	 * @returns true when the step was failed and must not be re-queued.
	 */
	private failIfNobodyCanAnswer(step: ReadyStep): boolean {
		const key = `${step.executionContext.executionId}:${step.stepId}`;
		const since = this.interactiveWaitSince.get(key) ?? Date.now();
		this.interactiveWaitSince.set(key, since);

		const interactiveWorkers = this.registry.summarize().filter(worker => worker.hasUserInterface).length;
		const decision = this.interactivityPolicy.decide({
			stepId: step.stepId,
			waitingMs: Date.now() - since,
			interactiveWorkers,
		});
		if (decision.action === 'wait') {
			return false;
		}

		this.interactiveWaitSince.delete(key);
		this.failStep(step.executionContext.executionId, step.stepId, decision.reason);
		return true;
	}

	/**
	 * Decides what happens to a step with requirements that found no idle worker (see {@link RequirementShortage}).
	 *
	 * @returns the declared sources to ask for a worker while it waits, or undefined when the step was failed and must not
	 *          be re-queued.
	 */
	private assessShortage(
		step: ReadyStep,
		placement: StepPlacement,
		guaranteesOf: GuaranteeLookup
	): ReadonlySet<string> | undefined {
		const { executionId } = step.executionContext;
		if (this.shortage === undefined) {
			this.failStep(
				executionId,
				step.stepId,
				`Step "${step.stepId}" requires ${(placement.requires ?? []).join(', ')} but this daemon was started without the declared guarantees of its worker sources, so no worker can be chosen for it. ` +
					'This is a wiring mistake in the daemon, not a configuration error -- please report it.'
			);
			return undefined;
		}
		const decision = this.shortage.assess({
			executionId,
			placement,
			connected: this.registry.listConnected(),
			guaranteesOf,
		});
		if (decision.action === 'fail') {
			this.failStep(executionId, step.stepId, decision.reason);
			return undefined;
		}
		return decision.sources;
	}

	/**
	 * Once per step that requires nothing and found no worker: names the connected workers of requirement-only sources
	 * that would have taken it, and the fix. Without it the step just waits (or runs on a forked host worker) and nothing
	 * says why a connected sandbox worker stays idle.
	 */
	private hintAboutRequirementOnlyWorkers(
		step: ReadyStep,
		placement: StepPlacement,
		isRequirementOnly: RequirementOnlyLookup
	): void {
		const key = `${step.executionContext.executionId}:${step.stepId}`;
		if (this.requirementOnlyHintReported.has(key)) {
			return;
		}
		const skipped = this.registry
			.listConnected()
			.filter(
				worker => isRequirementOnly(worker.sourceId) && this.router.refusalOf(placement, worker) === undefined
			);
		if (skipped.length === 0) {
			return;
		}
		this.requirementOnlyHintReported.add(key);
		const names = skipped.slice(0, MAX_REQUIREMENT_ONLY_WORKERS_NAMED).map(worker => worker.workerId);
		const more = skipped.length - names.length;
		this.logWriter.writeExecution(
			step.executionContext.executionId,
			`Step '${step.stepId}' is not run by the connected worker(s) ${names.join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}: their sources declare guarantees, so they serve only steps that require them. Add requires: [<guarantee>] or profile: <name> to the step (or the flow) to run it there (flow worker source list shows the guarantees); otherwise it waits for a host worker (one is forked when none is connected).`,
			'warning'
		);
	}
}
