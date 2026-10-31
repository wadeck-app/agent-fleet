import type { WebSocket } from 'ws';

import type { StepProgressDetail, StepToolActivity } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';
import { AssignmentLedger } from './AssignmentLedger.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { StalledStepWatch } from './StalledStepWatch.js';
import type { EngineEndReason } from './StepOutcomes.js';
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

/** What a worker has said about the tool call its step is in. */
interface ToolActivityKnowledge {
	activity: StepToolActivity | null;
	lastCompletedTool: string | undefined;
	/** Epoch ms (worker clock) of the model's final result, while no follow-up turn has started */
	finalResultAt: number | null;
}

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
	/** The tool call each executing step was last reported to be in, so a stall can name it */
	private readonly toolActivity = new Map<string, ToolActivityKnowledge>();
	/** Notices an executing step whose worker went quiet; the only detector of a wedged worker */
	private readonly stalledSteps: StalledStepWatch;
	/**
	 * Workers that were handed a step of each execution, kept until the execution is forgotten. Not derived from the
	 * ledger, which drops an assignment once it settles: the end of a run must still reach a worker whose only step
	 * finished long ago.
	 */
	private readonly served = new Map<string, Set<WebSocket>>();
	/** Callers waiting for some workers to hold nothing of an execution; checked whenever an assignment goes away. */
	private readonly settleWaiters = new Set<{
		executionId: string;
		workers: readonly WebSocket[];
		resolve: () => void;
	}>();

	/**
	 * @param failStep Fails a step the daemon itself decided cannot proceed.
	 */
	constructor(
		private readonly registry: WorkerRegistry,
		private readonly logWriter: LogWriter,
		private readonly queue: ReadyStepQueue,
		private readonly executions: ExecutionRegistry,
		private readonly failStep: (
			executionId: string,
			stepId: string,
			reason: string,
			endReason?: EngineEndReason
		) => void,
		private readonly stalledStepLimitMs: number,
		/** Injectable clock, so how long a call ran is testable */
		private readonly now: () => number = Date.now
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
		this.recordServed(assignmentId);
	}

	/** Workers handed a step of this execution (still connected), in the order they first got one. */
	servedWorkers(executionId: string): WebSocket[] {
		return [...(this.served.get(executionId) ?? [])];
	}

	/** What workers hold of this execution right now (handed over, not yet settled), for `flow cancel`. */
	heldAssignments(executionId: string): { assignmentId: string; worker: WebSocket }[] {
		return this.assignments.outstandingForExecution(executionId);
	}

	/** Executions that have been handed at least one step and not been forgotten yet. */
	servedExecutions(): string[] {
		return [...this.served.keys()];
	}

	/**
	 * Waits until none of `workers` holds an outstanding assignment of the execution: settled, discarded or revoked by a
	 * disconnect. Unbounded on its own: the caller races it against its timeout and calls `cancel` when it gives up.
	 */
	awaitSettled(executionId: string, workers: readonly WebSocket[]): { done: Promise<void>; cancel: () => void } {
		if (!this.holdsAssignment(executionId, workers)) {
			return { done: Promise.resolve(), cancel: () => {} };
		}
		let waiter!: { executionId: string; workers: readonly WebSocket[]; resolve: () => void };
		const done = new Promise<void>(resolve => {
			waiter = { executionId, workers, resolve };
			this.settleWaiters.add(waiter);
		});
		return { done, cancel: () => this.settleWaiters.delete(waiter) };
	}

	private recordServed(assignmentId: string): void {
		const executionId = this.assignments.describe(assignmentId)?.executionId;
		const worker = this.assignments.connectionOf(assignmentId);
		if (executionId === undefined || worker === undefined) {
			return;
		}
		const workers = this.served.get(executionId) ?? new Set<WebSocket>();
		workers.add(worker);
		this.served.set(executionId, workers);
	}

	private holdsAssignment(executionId: string, workers: readonly WebSocket[]): boolean {
		return workers.some(worker =>
			this.assignments.outstandingFor(worker).some(assignment => assignment.executionId === executionId)
		);
	}

	private releaseSettleWaiters(): void {
		for (const waiter of [...this.settleWaiters]) {
			if (!this.holdsAssignment(waiter.executionId, waiter.workers)) {
				this.settleWaiters.delete(waiter);
				waiter.resolve();
			}
		}
	}

	/** Drops an assignment that was never handed over, so it does not stay outstanding. */
	discardUnsent(assignmentId: string): void {
		this.assignments.settle(assignmentId);
		this.dispatched.delete(assignmentId);
		this.toolActivity.delete(assignmentId);
		this.releaseSettleWaiters();
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
		this.toolActivity.delete(assignmentId);
		// The payload was only kept for a possible re-dispatch, which can no longer happen.
		this.dispatched.delete(assignmentId);
		this.releaseSettleWaiters();
	}

	/** Records that a worker is still saying something about an assignment it holds. */
	noteAssignmentActivity(assignmentId: string, detail?: StepProgressDetail): void {
		this.stalledSteps.progressed(assignmentId);
		if (detail === undefined) {
			return;
		}
		const known = this.toolActivity.get(assignmentId) ?? {
			activity: null,
			lastCompletedTool: undefined,
			finalResultAt: null,
		};
		// `undefined` means "this report says nothing about it", unlike `null` which means "none".
		const next: ToolActivityKnowledge = {
			activity: detail.activity === undefined ? known.activity : detail.activity,
			lastCompletedTool: detail.lastCompletedTool ?? known.lastCompletedTool,
			finalResultAt: detail.finalResultAt === undefined ? known.finalResultAt : detail.finalResultAt,
		};
		this.toolActivity.set(assignmentId, next);
	}

	/**
	 * Says what the step was doing when it went quiet, as far as the worker could tell.
	 *
	 * Only model steps have tool calls. A provider that announces a call only once it is over (opencode,
	 * codex) never lets a call be seen in flight, and that is stated as such rather than guessed at.
	 */
	private describeToolActivity(assignmentId: string, step: ReadyStep | undefined): string {
		const known = this.toolActivity.get(assignmentId);
		if (known?.activity) {
			const { tool, summary, startedAt } = known.activity;
			const seconds = Math.max(0, Math.round((this.now() - startedAt) / 1000));
			return `Last tool call: ${tool} "${summary}" running for ${String(seconds)}s. `;
		}
		if (known === undefined && step?.stepConfig.type !== 'model') {
			return '';
		}
		if (known?.finalResultAt !== null && known?.finalResultAt !== undefined) {
			// Local time of the daemon, which is where the user reads this
			const at = new Date(known.finalResultAt).toTimeString().slice(0, 8);
			return `The model had already produced its final result at ${at}; the process did not exit, likely held by a background task or child process. `;
		}
		const last = known?.lastCompletedTool;
		return `No tool call in progress was observed${last === undefined ? '' : ` (last completed tool call: ${last})`}. `;
	}

	/** Forgets the re-dispatch budget of an execution that is over. */
	forgetExecution(executionId: string): void {
		this.served.delete(executionId);
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
			const toolActivity = this.describeToolActivity(assignmentId, step);
			this.toolActivity.delete(assignmentId);
			const connection = this.assignments.connectionOf(assignmentId);
			this.assignments.settle(assignmentId);
			this.releaseSettleWaiters();
			// A wedged worker never sends the `ready` that would free it, so without this it would stay
			// "busy" forever: the daemon could never hibernate and updates would wait on it for good.
			if (connection !== undefined) {
				this.registry.disconnect(connection);
			}
			this.failStep(
				assignment.executionId,
				step?.stepId ?? assignment.stepId,
				`the worker running this step reported nothing for ${String(Math.round(this.stalledStepLimitMs / 1000))}s, so it is treated as stuck. ` +
					toolActivity +
					'It was not retried automatically because it may have already had an effect. ' +
					'A step that is legitimately quiet for that long needs a higher queue.stepSilenceLimitSeconds.',
				'stalled'
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
		// First: a step failed below can end the run, and a socket that is gone must not be told about it.
		for (const workers of this.served.values()) {
			workers.delete(worker);
		}
		const revoked = this.assignments.revokeWorker(worker);
		this.releaseSettleWaiters();
		for (const assignment of revoked) {
			const { executionId, stepId, assignmentId, started } = assignment;
			const step = this.dispatched.get(assignmentId);
			this.dispatched.delete(assignmentId);
			this.toolActivity.delete(assignmentId);

			if (started) {
				// It may already have changed something: an engine failure, so neither we nor the
				// step's retry/onFailure silently replay a half-run step.
				this.failStep(
					executionId,
					stepId,
					`the worker running this step disconnected while it was executing. It was not retried because it may have already had an effect (the step's retry and onFailure do not apply to an engine failure); re-run the flow if it is safe to repeat.`,
					'worker_lost'
				);
				continue;
			}

			if (!this.executions.isActive(executionId)) {
				// The run already ended (terminal failure of a sibling): re-queuing would hand a
				// step to a worker for an execution that no longer exists.
				this.logWriter.writeExecution(
					executionId,
					`Worker disconnected before starting ${stepId}, but the execution is already over; step dropped, not queued again`,
					'info'
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
