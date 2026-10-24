import type { InteractivityPolicyProvider, StepPlacement } from 'extension-points';
import { buildSubStepFeedback } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_SECRETS, WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import { assertStepLabels } from './LabelMatcher.js';
import type { ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { StepRouter } from './StepRouter.js';
import type { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import type { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

/** Hands queued steps to the idle workers that may run them. */
export class StepDispatcher {
	/** Chooses which live worker a step goes to (S3, S4) */
	private readonly router = new StepRouter();
	/** When each interactive step started waiting, so an S9 policy can bound its own wait */
	private readonly interactiveWaitSince = new Map<string, number>();

	/**
	 * @param failStep Fails a step the daemon itself decided cannot proceed.
	 * @param interactivityPolicy S9 policy deciding the fate of a step needing a human (D#39).
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
		private readonly failStep: (executionId: string, stepId: string, reason: string) => void
	) {}

	/** Forgets the interactive waits of an execution that is over. */
	forgetExecution(executionId: string): void {
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

		while (this.queue.length > 0) {
			const step = this.queue.shift()!;

			let placement: StepPlacement;
			try {
				placement = this.placementFor(step);
			} catch (err) {
				// A step whose routing cannot even be described is never placeable, so
				// leaving it queued would stall the flow with no explanation.
				this.failStep(step.executionContext.executionId, step.stepId, normalizeError(err).message);
				continue;
			}

			const idleWorker = this.router.select(placement, this.registry.listIdle());
			if (idleWorker === undefined && placement.requiresUserInterface && this.failIfNobodyCanAnswer(step)) {
				continue;
			}
			if (idleWorker) {
				this.dispatchTo(idleWorker, step);
			} else {
				unplaced.push(step);
			}
		}

		this.queue.unshift(...unplaced);
		this.demand.cover(unplaced.length);
	}

	private dispatchTo(idleWorker: WebSocket, step: ReadyStep): void {
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
			relaunchFeedback
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
	 * Describes a step for routing.
	 *
	 * @throws when the step's `labels` are not a list. Schema validation already refuses
	 *         such a flow before it starts (D#7), so this covers the path that skips it --
	 *         a step injected at runtime. Reported as a step failure by the caller, because
	 *         an unmatchable label set means no worker is ever eligible and presenting that
	 *         as "waiting for capacity" would hide the mistake forever.
	 */
	private placementFor(step: ReadyStep): StepPlacement {
		const labels = (step.stepConfig as { labels?: unknown }).labels;
		assertStepLabels(labels, step.stepId);
		// Only `type: script` steps carry `shell:` (Proposal 1); every other step type has
		// no such field, which `workerSatisfiesShell` already treats as "no constraint".
		const shellKind = (step.stepConfig as { shell?: 'bash' | 'cmd' | 'pwsh' }).shell;
		const projectRoot = this.executions.projectOf(step.executionContext.executionId);
		return {
			stepId: step.stepId,
			labels: labels ?? [],
			// The step type is the only signal for this: there is no step-level
			// `interactive` field, by design (D#60).
			requiresUserInterface: step.stepConfig.type === 'user_intervention',
			...(projectRoot !== undefined ? { projectRoot } : {}),
			...(shellKind !== undefined ? { shellKind } : {}),
		};
	}
}
