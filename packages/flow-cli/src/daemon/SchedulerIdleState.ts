import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import type { RunEndCoordinator } from './RunEndCoordinator.js';

/**
 * What the scheduler still holds, as the daemon's idle-exit check and its diagnostics read it.
 *
 * Idle-exit consults each condition by name rather than relying on one of them implying the others: a kept-alive
 * execution (`flow resume`) does not move the active count the way a running one does, and that is an implementation
 * detail of cleanup being skipped, not a contract. Naming every condition keeps the dependency explicit instead of
 * incidental, so a change to that bookkeeping cannot silently reopen the race `flow resume` depends on not happening
 * (idle-exit destroying the in-memory scheduler state before an operator can run it).
 */
export class SchedulerIdleState {
	constructor(
		private readonly queue: Pick<ReadyStepQueue, 'length'>,
		private readonly executions: Pick<ExecutionRegistry, 'activeExecutionCount' | 'isActive' | 'resumableCount'>,
		private readonly runEnd: Pick<RunEndCoordinator, 'hasPending'>
	) {}

	isQueueEmpty(): boolean {
		return this.queue.length === 0;
	}

	hasActiveExecutions(): boolean {
		return this.executions.activeExecutionCount() > 0;
	}

	/**
	 * Whether the scheduler still has work for this execution (steps queued, running, or about to
	 * be re-run by a retry, loop or sub-step restart). False once it settled -- completed, failed
	 * terminally -- or is unknown.
	 *
	 * The execution store cannot answer this: a step that failed and is about to run again still
	 * reads `failed` there until its next attempt starts, which made the daemon declare a run
	 * failed (and fire `onFlowError`) while the scheduler was in the middle of recovering it.
	 */
	isExecutionActive(executionId: string): boolean {
		return this.executions.isActive(executionId);
	}

	/** Whether any execution is waiting on `flow resume` after an unanswered-intervention timeout. */
	hasResumableInterventions(): boolean {
		return this.executions.resumableCount() > 0;
	}

	/**
	 * Whether a finished run is still being closed: its workers are settling or acknowledging, or its workspace is being
	 * released. The run is no longer an active execution then, so the idle check consults this too.
	 */
	hasPendingRunEnds(): boolean {
		return this.runEnd.hasPending();
	}

	/**
	 * One-line snapshot of everything the idle check consults, for the daemon's idle-exit log entries.
	 *
	 * Added after an idle-exit race with `flow resume` was reported but could not be conclusively reproduced. If it
	 * recurs, this line in the daemon log answers "what did the idle check actually see" directly.
	 */
	describe(): string {
		return `queue=${String(this.queue.length)} activeExecutions=${String(this.executions.activeExecutionCount())} resumableInterventions=${String(this.executions.resumableCount())} pendingRunEnds=${this.runEnd.hasPending() ? '1+' : '0'}`;
	}
}
