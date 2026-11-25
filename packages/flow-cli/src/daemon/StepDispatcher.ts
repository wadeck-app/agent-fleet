import type { InteractivityPolicyProvider, StepPlacement } from 'extension-points';
import { buildSubStepFeedback } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_SECRETS, WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { StepDeferral } from '../storage/ExecutionTransition';
import type { LogWriter } from '../storage/LogWriter';
import type { BoundStepRouting } from './BoundStepWait.js';
import type { DaemonSecrets } from './DaemonSecrets.js';
import { DispatchLookups } from './DispatchLookups.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import { HostToolRouting } from './HostToolRouting.js';
import { RunWorkerAffinity } from './RunWorkerAffinity.js';
import { ReRunKindTracker } from './ReRunKindTracker.js';
import type { ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { RequirementOnlyHint } from './RequirementOnlyHint.js';
import { RequirementShortage } from './RequirementShortage.js';
import { StepPlacementBuilder } from './StepPlacementBuilder.js';
import { StepRouter } from './StepRouter.js';
import type { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import type { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import {
	DEFAULT_READINESS_SETTINGS,
	type DeferralReport,
	type ReadinessMessageOutcome,
	WorkerReadiness,
	keyOfStep,
} from './WorkerReadiness.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import type { GuaranteeLookup, RequirementOnlyLookup } from './WorkerTypeCatalog.js';

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
	/** Tells, once per step, which connected requirement-only workers did not take it */
	private readonly requirementOnlyHint: RequirementOnlyHint;
	/** Tells a retry from another re-run when a step starts again, for the attempt history */
	private readonly reRunKinds = new ReRunKindTracker();
	/** Which worker served the latest step of each run, so the next step prefers it (soft stickiness) */
	private readonly workerAffinity = new RunWorkerAffinity();
	/** When each interactive step started waiting, so an S9 policy can bound its own wait */
	private readonly interactiveWaitSince = new Map<string, number>();
	/** The optional "are you ready?" question asked of a worker before a step is assigned to it */
	private readonly readiness: WorkerReadiness;

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
		this.requirementOnlyHint = new RequirementOnlyHint(registry, this.router, logWriter);
		this.shortage =
			routing.declaredGuarantees === undefined
				? undefined
				: new RequirementShortage(this.router, routing.declaredGuarantees, routing.wait, routing.contactErrors);
		this.readiness = new WorkerReadiness(
			registry,
			routing.readiness ?? DEFAULT_READINESS_SETTINGS,
			() => this.tryDispatch(),
			report => this.reportDeferred(report)
		);
	}

	/** Drops the timers of the steps waiting for a worker that meets their requirements or that is ready, for the daemon stop. */
	stop(): void {
		this.routing.wait.stop();
		this.readiness.stop();
	}

	/** Cancels the readiness question open on a worker that disconnected, and forgets its verdict and retry times. */
	workerGone(worker: WebSocket): void {
		this.readiness.workerGone(worker);
	}

	/** `readiness_alive` from a worker; see {@link WorkerReadiness.handleAlive}. */
	onReadinessAlive(worker: WebSocket, requestId: string): ReadinessMessageOutcome {
		return this.readiness.handleAlive(worker, requestId);
	}

	/** `readiness_answer` from a worker; see {@link WorkerReadiness.handleAnswer}. */
	onReadinessAnswer(worker: WebSocket, requestId: string, answer: unknown): ReadinessMessageOutcome {
		return this.readiness.handleAnswer(worker, requestId, answer);
	}

	/** Forgets the waits of an execution that is over. */
	forgetExecution(executionId: string): void {
		this.readiness.forgetExecution(executionId);
		this.routing.wait.forgetExecution(executionId);
		this.lookups.forgetExecution(executionId);
		this.workerAffinity.forgetExecution(executionId);
		this.requirementOnlyHint.forgetExecution(executionId);
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
			const stepKey = keyOfStep(step);

			// Purging happens once, when the run fails; a step re-queued later (a worker lost
			// after the cleanup) must not be handed out for an execution that no longer exists.
			if (!this.executions.isActive(step.executionContext.executionId)) {
				this.logWriter.writeExecution(
					step.executionContext.executionId,
					`Step ${step.stepId} dropped from the queue: its execution is already over`,
					'info'
				);
				this.readiness.clearStep(stepKey);
				continue;
			}

			// `flow pause`: the step keeps its place in the queue, untouched and not counted as demand (no worker is asked for
			// it, no requirement wait starts); `flow unpause` dispatches again, so nothing is lost or handed out twice. A
			// readiness question or deferral of the step is dropped: the pause does not count in its bounded wait.
			if (this.executions.isPaused(step.executionContext.executionId)) {
				this.readiness.clearStep(stepKey);
				unplaced.push(step);
				continue;
			}

			// The step stayed queued for the whole bounded wait of a worker that is not ready: it fails, with the last reason.
			const notReadyFailure = this.readiness.expiredFailure(step, text =>
				this.daemonSecrets.masks.mask(step.executionContext.executionId, text)
			);
			if (notReadyFailure !== undefined) {
				this.failStep(step.executionContext.executionId, step.stepId, notReadyFailure);
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
			// Before the router, so no routing plugin can widen the set: a worker held by another run is not offered, the
			// step waits for it like for a busy one (see RequirementShortage for a step with requirements).
			// A worker with an open readiness question, or holding the `ready` of another step, is not offered either; one that
			// said not ready to this step is not offered before its retry time. A worker that said `ready` to this step is
			// the only one offered to it, so the assignment goes where the answer came from.
			const verdictWorker = this.readiness.verdictWorkerOf(stepKey);
			const offerable = this.registry
				.listIdle()
				.filter(
					({ worker }) => worker.heldBy === undefined || worker.heldBy === step.executionContext.executionId
				)
				.filter(({ ws }) =>
					verdictWorker === undefined
						? !this.readiness.isReserved(ws, stepKey) && !this.readiness.isBlocked(ws, stepKey)
						: ws === verdictWorker
				);
			const idle = needsHostTools ? HostToolRouting.capable(offerable) : offerable;
			const idleWorker = this.router.select(
				placement,
				idle,
				requirementOnly,
				guarantees,
				this.workerAffinity.preferredWorkerOf(step.executionContext.executionId)
			);
			// No worker is free for it, but one is being asked about it or said not ready until later: the step waits for
			// that. It is neither unmet demand (no worker is provisioned for it) nor a requirement shortage.
			if (idleWorker === undefined && this.readiness.isHeld(stepKey)) {
				unplaced.push(step);
				continue;
			}
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
				// A worker taking part in readiness is asked first: the step stays queued until it says `ready`.
				if (this.readiness.consult(idleWorker, step, this.toolOf(step)) === 'wait') {
					unplaced.push(step);
					continue;
				}
				// Handed out: its other questions, verdicts and deferral are over.
				this.readiness.clearStep(stepKey);
				this.dispatchTo(idleWorker, step, placement.requires);
			} else {
				if (requirementOnly !== undefined) {
					this.requirementOnlyHint.report(step, placement, requirementOnly);
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

		// A `ready` this pass did not use (step paused, over, or no longer routable to that worker) must not hold its worker.
		this.readiness.endPass();
		this.queue.unshift(...unplaced);
		this.demand.cover(unplacedForHost, waitingForSources);
	}

	/** The model provider a step uses, for the readiness question; absent for a script or user_intervention step. */
	private toolOf(step: ReadyStep): 'claude' | 'codex' | 'opencode' | undefined {
		return step.stepConfig.type === 'model' ? (step.stepConfig.provider ?? 'claude') : undefined;
	}

	/** Says, in the execution log and as one `flow.step.deferred` event, that a worker is not ready for a queued step. */
	private reportDeferred({ executionId, stepId, workerId, deferral, maxWaitSeconds }: DeferralReport): void {
		const mask = (text: string): string => this.daemonSecrets.masks.mask(executionId, text);
		const masked: StepDeferral = { ...deferral, reason: mask(deferral.reason), message: mask(deferral.message) };
		const who =
			deferral.phase === 'worker'
				? `worker ${workerId} said not ready`
				: `worker ${workerId} did not answer the readiness question (${deferral.phase === 'ack' ? 'alive ack' : 'readiness answer'} deadline)`;
		this.logWriter.writeExecution(
			executionId,
			`Step ${stepId} stays queued: ${who}: ${masked.reason} -- ${masked.message}. Asking again in ${String(deferral.retryAfterSeconds)}s; the step fails after ${String(maxWaitSeconds)}s of waiting (worker.notReadyMaxWaitSeconds).`,
			'warning'
		);
		this.executionStore.notifyStepDeferred(executionId, stepId, masked);
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
		if (worker !== undefined) {
			this.workerAffinity.record(step.executionContext.executionId, worker.workerId);
		}
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
			isHoldStale: worker => worker.heldBy !== undefined && !this.executions.isActive(worker.heldBy),
		});
		if (decision.action === 'fail') {
			this.failStep(executionId, step.stepId, decision.reason);
			return undefined;
		}
		return decision.sources;
	}
}
