import { isExecutionId } from 'flow-core';
import type { WebSocket } from 'ws';

import type { DaemonResponse } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import type { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';

/** The `lastError` of a cancelled execution and the `error`/`skippedReason` of each of its steps. */
export const CANCELLED_BY_USER = 'cancelled by user';

/** What the canceller changes, each as the narrowest view of the collaborator that owns it. */
export interface ExecutionCancellerParts {
	executions: Pick<ExecutionRegistry, 'isActive' | 'resumable'>;
	queue: Pick<ReadyStepQueue, 'purge'>;
	store: Pick<ExecutionStore, 'exists' | 'read' | 'update' | 'markStepSkipped' | 'markExecutionFailed'>;
	supervisor: Pick<WorkerAssignmentSupervisor, 'heldAssignments' | 'settleAssignment'>;
	hooks: Pick<ExecutionHooks, 'remove'>;
	workspaces: Pick<ExecutionWorkspaces, 'release'>;
	logWriter: Pick<LogWriter, 'writeExecution'>;
	/** Drops a worker's connection (the daemon's way to abandon a step it cannot stop; see `WorkerRegistry.disconnect`). */
	disconnectWorker: (worker: WebSocket) => void;
	/** The end-of-run path of an execution the scheduler holds (`StepOutcomes.cleanupExecution`). */
	endExecution: (executionId: string, reason: 'failed', priorError: Error) => void;
	/** Lets the other executions use what the cancelled one held. */
	tryDispatch: () => void;
}

/**
 * `flow cancel`: ends ONE execution, in any non-terminal state, without touching the daemon or any other execution.
 *
 * The record ends as `failed` with `endReason: 'cancelled'` and `lastError: 'cancelled by user'` (not a new status:
 * every consumer of the status keeps its meaning). Its pending steps are settled as not run, a step in flight fails,
 * all with the same reason. The in-memory state, the workers that served the run and the workspace are released by the
 * normal end-of-run path, so the worker types are told the run ended exactly as for a failure (`reason: 'failed'`).
 *
 * A worker holding a step of the run is dropped, the same mechanism as for a stalled step: the protocol has no message
 * that stops a step. No flow hook fires (`onFlowError`/`onStepFailed` mean "the flow failed"; this is not a failure).
 */
export class ExecutionCanceller {
	constructor(private readonly parts: ExecutionCancellerParts) {}

	cancel(executionId: string, projectId?: string): DaemonResponse {
		const { store, executions } = this.parts;
		if (!isExecutionId(executionId) || !store.exists(executionId)) {
			return {
				type: 'error',
				code: 'EXECUTION_NOT_FOUND',
				message: `No execution found with id "${executionId}". Find the id with: flow history`,
			};
		}
		const state = store.read(executionId);
		if (projectId !== undefined && state.projectId !== projectId) {
			return {
				type: 'error',
				code: 'PROJECT_MISMATCH',
				message:
					`Execution "${executionId}" does not belong to the selected project (${state.projectId ?? 'no project recorded'}). ` +
					'Drop -p/--project (and FLOW_PROJECT) to cancel it, or select its project.',
			};
		}
		// A resumable execution is recorded as failed but still held by the daemon: it is the one terminal-looking state to cancel.
		const held = executions.resumable(executionId) !== undefined || executions.isActive(executionId);
		if (!held && (state.status === 'completed' || state.status === 'failed')) {
			if (state.endReason === 'cancelled') {
				return { type: 'execution_cancelled', executionId, alreadyCancelled: true };
			}
			const cause = state.lastError === undefined ? '' : ` (${firstLine(state.lastError)})`;
			return {
				type: 'error',
				code: 'EXECUTION_ALREADY_ENDED',
				message: `Execution "${executionId}" already ended as ${state.status}${cause}; there is nothing to cancel.`,
			};
		}

		this.parts.logWriter.writeExecution(executionId, `Execution cancelled by the user (flow cancel)`, 'warning');
		this.parts.queue.purge(executionId);
		this.parts.hooks.remove(executionId);
		try {
			this.recordCancellation(executionId);
		} finally {
			// Even when the record could not be written, the daemon must stop holding the execution: it is what blocks updates.
			this.release(executionId);
		}
		this.parts.tryDispatch();
		return { type: 'execution_cancelled', executionId, alreadyCancelled: false };
	}

	private recordCancellation(executionId: string): void {
		const { store } = this.parts;
		for (const [stepId, step] of Object.entries(store.read(executionId).steps)) {
			if (step.status === 'pending') {
				store.markStepSkipped(executionId, stepId, CANCELLED_BY_USER);
			}
		}
		store.update(executionId, { lastError: CANCELLED_BY_USER, endReason: 'cancelled' });
		// Fails the steps still running with the `lastError` above and publishes the usual execution-failed event.
		store.markExecutionFailed(executionId);
	}

	private release(executionId: string): void {
		const { executions, supervisor } = this.parts;
		const reason = new Error(CANCELLED_BY_USER);
		if (executions.isActive(executionId)) {
			// Before the workers are dropped: the end of the run reads which workers served it.
			this.parts.endExecution(executionId, 'failed', reason);
		} else {
			// No scheduler: a record that never got one, or whose in-memory state is already gone. Only the workspace can remain.
			this.parts.workspaces.release(executionId, reason);
		}
		const workers = new Set<WebSocket>();
		for (const { assignmentId, worker } of supervisor.heldAssignments(executionId)) {
			// Settled first, so the disconnect that follows finds nothing to fail or requeue.
			supervisor.settleAssignment(assignmentId);
			workers.add(worker);
		}
		for (const worker of workers) {
			this.parts.disconnectWorker(worker);
		}
	}
}

function firstLine(text: string): string {
	const line = text.split(/\r?\n/).find(candidate => candidate.trim() !== '') ?? text;
	return line.length <= 200 ? line : `${line.slice(0, 197)}...`;
}
