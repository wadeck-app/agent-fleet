import type { WebSocket } from 'ws';

import type { LogWriter } from '../storage/LogWriter';
import { AssignmentLedger } from './AssignmentLedger.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { StalledStepWatch } from './StalledStepWatch.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

/**
 * How many times a step may be re-dispatched after a worker vanished before it started.
 *
 * Each re-dispatch is free by design (D#43), so without a bound a step that every worker
 * drops before starting would be requeued forever and the flow would never finish or fail.
 */
export const MAX_REDISPATCHES = 3;

/**
 * Default silence after which an executing step is treated as stuck.
 *
 * Thirty minutes because a model step can think for a long time without printing, and failing honest
 * work is worse than noticing a wedged one late. Override with `queue.stepSilenceLimit`.
 */
export const DEFAULT_STEP_SILENCE_LIMIT_MS = 30 * 60 * 1000;

/**
 * Keeps track of the work handed to workers: binds reports to assignments (T-05), notices a worker
 * gone quiet, and decides what happens to the steps a disconnected worker was holding.
 */
export class WorkerAssignmentSupervisor {
	/** Work actually handed to each worker, so results can be bound to it (T-05) */
	private readonly assignments = new AssignmentLedger();
	/**
	 * What was handed to a worker, kept until the assignment settles.
	 *
	 * A disconnect has to re-dispatch the *payload*, and the assignment record only names
	 * the step -- the rendered config and context are not recoverable from it (D#62).
	 */
	private readonly dispatched = new Map<string, ReadyStep>();
	/** Re-dispatches spent per step, so a step nobody ever starts cannot loop forever (D#62) */
	private readonly redispatchCounts = new Map<string, number>();
	/** Notices an executing step whose worker went quiet; the only detector of a wedged worker */
	private readonly stalledSteps: StalledStepWatch;

	/**
	 * @param failStep Fails a step the daemon itself decided cannot proceed.
	 */
	constructor(
		private readonly registry: WorkerRegistry,
		private readonly logWriter: LogWriter,
		private readonly queue: ReadyStepQueue,
		private readonly executions: ExecutionRegistry,
		private readonly failStep: (executionId: string, stepId: string, reason: string) => void,
		private readonly stalledStepLimitMs: number
	) {
		this.stalledSteps = new StalledStepWatch(stalledStepLimitMs);
	}

	/** Records an assignment about to be sent to `worker`, keeping its payload for a possible re-dispatch (D#62). */
	issue(worker: WebSocket, step: ReadyStep): string {
		const assignment = this.assignments.issue(worker, step.executionContext.executionId, step.stepId);
		this.dispatched.set(assignment.assignmentId, step);
		return assignment.assignmentId;
	}

	/**
	 * Watched from the hand-over, not only from step_started: a worker confirms with
	 * step_started before anything else, so an assignment it never confirms would
	 * otherwise be waited on forever.
	 */
	watchHandedOver(assignmentId: string): void {
		this.stalledSteps.started(assignmentId);
	}

	/** Drops an assignment that was never handed over, so it does not stay outstanding. */
	discardUnsent(assignmentId: string): void {
		this.assignments.settle(assignmentId);
		this.dispatched.delete(assignmentId);
	}

	/**
	 * Confirms a worker is reporting against work this daemon actually gave it (T-05).
	 *
	 * Returns false when the report cannot be bound to an outstanding assignment, having
	 * already logged why. The caller must then drop the message: accepting it would let
	 * one worker write another execution's step outputs.
	 */
	verifyAssignment(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): boolean {
		const result = this.assignments.verify(worker, assignmentId, executionId, stepId);
		if (!result.ok) {
			process.stderr.write(`[CommandHandler] rejected worker report: ${result.reason}\n`);
			return false;
		}
		return true;
	}

	/** As {@link verifyAssignment}, for messages that name no step (inject_steps). */
	verifyAssignmentScope(worker: WebSocket, assignmentId: string, executionId: string): boolean {
		const result = this.assignments.verifyScope(worker, assignmentId, executionId);
		if (!result.ok) {
			process.stderr.write(`[CommandHandler] rejected worker report: ${result.reason}\n`);
			return false;
		}
		return true;
	}

	/** Closes an assignment once its outcome has been accepted. */
	settleAssignment(assignmentId: string): void {
		this.assignments.settle(assignmentId);
		this.stalledSteps.settled(assignmentId);
		// The payload was only kept for a possible re-dispatch, which can no longer happen.
		this.dispatched.delete(assignmentId);
	}

	/** Records that a worker is still saying something about an assignment it holds. */
	noteAssignmentActivity(assignmentId: string): void {
		this.stalledSteps.progressed(assignmentId);
	}

	/** Forgets the re-dispatch budget of an execution that is over. */
	forgetExecution(executionId: string): void {
		// Keyed by execution and step, so nothing else would ever remove these entries and a
		// long-lived daemon would accumulate one per step it has ever run.
		for (const key of this.redispatchCounts.keys()) {
			if (key.startsWith(`${executionId}:`)) {
				this.redispatchCounts.delete(key);
			}
		}
	}

	/**
	 * Fails the steps whose worker went quiet, and reports each one.
	 *
	 * Called on a timer by `Daemon`: nothing else would notice, since a wedged worker keeps its
	 * socket open and answers pings. The step is failed rather than re-dispatched -- it was already
	 * executing, so it may have changed something, exactly as for a mid-step disconnect (D#65).
	 */
	failStalledSteps(): void {
		for (const assignmentId of this.stalledSteps.stalled()) {
			const step = this.dispatched.get(assignmentId);
			const assignment = this.assignments.describe(assignmentId);
			if (assignment === undefined) {
				continue;
			}
			if (!assignment.started) {
				// Nothing ran, so there is nothing to protect: drop the worker and let the normal
				// disconnect path hand the step to another one, instead of failing it.
				const connection = this.assignments.connectionOf(assignmentId);
				this.logWriter.writeExecution(
					assignment.executionId,
					`Worker never confirmed starting step ${assignment.stepId} within ${String(Math.round(this.stalledStepLimitMs / 1000))}s; dropping its connection so the step is handed over again`,
					'warning'
				);
				if (connection !== undefined) {
					this.registry.disconnect(connection);
				}
				continue;
			}
			this.dispatched.delete(assignmentId);
			const connection = this.assignments.connectionOf(assignmentId);
			this.assignments.settle(assignmentId);
			// A wedged worker never sends the `ready` that would free it, so without this it would stay
			// "busy" forever: the daemon could never hibernate and updates would wait on it for good.
			if (connection !== undefined) {
				this.registry.disconnect(connection);
			}
			this.failStep(
				assignment.executionId,
				step?.stepId ?? assignment.stepId,
				`the worker running this step reported nothing for ${String(Math.round(this.stalledStepLimitMs / 1000))}s, so it is treated as stuck. ` +
					'It was not retried automatically because it may have already had an effect. ' +
					'A step that is legitimately quiet for that long needs a higher queue.stepSilenceLimitSeconds.'
			);
		}
	}

	/**
	 * Records that a worker has begun executing an assigned step (D#65).
	 *
	 * Verified like any other result message: a worker must not be able to change how
	 * another worker's disconnect is classified (T-05).
	 */
	onStepStarted(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): void {
		const verified = this.assignments.verify(worker, assignmentId, executionId, stepId);
		if (!verified.ok) {
			process.stderr.write(`[CommandHandler] rejected step_started: ${verified.reason}\n`);
			return;
		}
		this.assignments.markStarted(assignmentId);
		// Watching begins now, not at dispatch: a step waiting to be picked up is not stuck.
		this.stalledSteps.started(assignmentId);
		// The re-dispatch budget counts hand-offs that never began. This one did, so the
		// step's earlier aborted hand-offs must not still be held against it: a later retry
		// would otherwise start part-way through a budget it never spent.
		this.redispatchCounts.delete(`${executionId}:${stepId}`);
		this.logWriter.writeExecution(executionId, `Step ${stepId} started executing`, 'info');
	}

	/**
	 * Decides what happens to the steps a disconnected worker was holding (D#65).
	 *
	 * Deliberately does **not** dispatch: the caller removes the worker from the registry
	 * afterwards, so dispatching here could hand the requeued step straight back to the
	 * socket that just died. `Daemon` calls `tryDispatch()` once the removal is done.
	 */
	handleWorkerDisconnect(worker: WebSocket): void {
		for (const assignment of this.assignments.revokeWorker(worker)) {
			const { executionId, stepId, assignmentId, started } = assignment;
			const step = this.dispatched.get(assignmentId);
			this.dispatched.delete(assignmentId);

			if (started) {
				// It may already have changed something, so the author's retry/onFailure
				// decides rather than us silently replaying a half-run step.
				this.failStep(
					executionId,
					stepId,
					`the worker running this step disconnected while it was executing. It was not retried automatically because it may have already had an effect; re-run the flow, or declare "retry" on the step if it is safe to repeat.`
				);
				continue;
			}

			const key = `${executionId}:${stepId}`;
			const spent = (this.redispatchCounts.get(key) ?? 0) + 1;
			if (step === undefined) {
				// Nothing to re-send, so waiting for this step would hang the execution.
				this.failStep(
					executionId,
					stepId,
					`the worker holding this step disconnected before starting it, and the daemon no longer has the assignment to re-send. Please report this.`
				);
				continue;
			}
			if (spent > MAX_REDISPATCHES) {
				this.failStep(
					executionId,
					stepId,
					`no worker started this step: it was handed out ${String(MAX_REDISPATCHES + 1)} times and every worker disconnected first. Check that a worker stays connected ("flow worker list") and that it serves this project.`
				);
				continue;
			}

			this.redispatchCounts.set(key, spent);
			// The step was never sent as far as the flow is concerned, which is exactly
			// what unacknowledge means -- so no retry attempt is consumed (D#43).
			this.executions.scheduler(executionId)?.unacknowledge(stepId);
			this.queue.unshift(step);
			this.logWriter.writeExecution(
				executionId,
				`Worker disconnected before starting ${stepId}; re-queued (attempt ${String(spent)} of ${String(MAX_REDISPATCHES)})`,
				'info'
			);
		}
	}
}
