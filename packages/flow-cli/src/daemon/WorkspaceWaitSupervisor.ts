import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { ExecutionState } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { AllocatedWorkspace, WorkspaceWaiting } from './ExecutionWorkspaces';
import type { WaitingRuns } from './WaitingRuns';

type ReadyWorkspace = Extract<AllocatedWorkspace, { ok: true }>;

/**
 * Follows the runs that wait for a workspace until each one starts, fails or is cancelled.
 *
 * A waiting run is recorded (`queued`, with `workspaceWait`) and held in {@link WaitingRuns}; nothing else of it exists yet
 * (no scheduler, worker, permit). Each new reason of the provider goes to the log of the run and its record; when the
 * workspace is granted the run is launched; a refusal fails the run with the provider's message. A cancelled run is
 * left to the canceller, which already recorded it.
 */
export class WorkspaceWaitSupervisor {
	private stopping = false;

	constructor(
		private readonly waitingRuns: WaitingRuns,
		private readonly store: Pick<ExecutionStore, 'read' | 'update' | 'markExecutionFailed'>,
		private readonly logWriter: Pick<LogWriter, 'writeExecution'>,
		/** Gives back the workspace of an execution (it cannot be used). */
		private readonly release: (executionId: string, reason: Error) => void
	) {}

	/**
	 * The daemon is stopping: no waiting run may be promoted any more (it would start and be killed by the shutdown, then
	 * recorded as interrupted). Every wait is stopped in its provider; a slot granted meanwhile is given back; the records
	 * stay waiting, so the next daemon starts them again.
	 */
	stop(): void {
		this.stopping = true;
		this.waitingRuns.cancelAll();
	}

	/**
	 * @param launch Starts the run now that it has its workspace. May throw: the run is then failed with the cause.
	 */
	watch(executionId: string, waiting: WorkspaceWaiting, launch: (workspace: ReadyWorkspace) => void): void {
		this.waitingRuns.add(executionId, waiting.cancel);
		waiting.onUpdate(message => this.noteReason(executionId, message));
		void waiting.settled
			.then(allocated => this.settle(executionId, allocated, launch))
			.catch((err: unknown) => {
				// Reached only if settle itself broke: nothing else would tell, and the run would stay queued for ever.
				this.waitingRuns.remove(executionId);
				this.failRun(
					executionId,
					`The daemon failed while starting the waiting execution: ${normalizeError(err).message}`
				);
			});
	}

	private noteReason(executionId: string, message: string): void {
		this.logWriter.writeExecution(executionId, message, 'warning');
		const wait = this.currentWait(executionId);
		if (wait !== undefined) {
			this.store.update(executionId, { workspaceWait: { ...wait, message } });
		}
	}

	private settle(
		executionId: string,
		allocated: AllocatedWorkspace,
		launch: (workspace: ReadyWorkspace) => void
	): void {
		this.waitingRuns.remove(executionId);
		if (this.stopping) {
			if (allocated.ok) {
				this.release(executionId, new Error('the daemon stopped while the execution waited for its workspace'));
			}
			return;
		}
		const stillWaiting = this.currentWait(executionId) !== undefined;
		if (!stillWaiting) {
			// Cancelled (or otherwise ended) while it waited: the record is settled already.
			if (allocated.ok) {
				this.release(executionId, new Error('the execution ended while it waited for its workspace'));
			}
			return;
		}
		if (!allocated.ok) {
			const message =
				allocated.response.type === 'error' ? allocated.response.message : 'unknown workspace error';
			this.failRun(executionId, message);
			return;
		}
		try {
			launch(allocated);
		} catch (err) {
			const cause = normalizeError(err);
			process.stderr.write(`[daemon] execution ${executionId}: ${cause.message}\n${cause.stack ?? ''}\n`);
			this.failRun(executionId, `Engine error while starting the execution: ${cause.message}`);
			this.release(executionId, cause);
		}
	}

	private currentWait(executionId: string): ExecutionState['workspaceWait'] {
		try {
			return this.store.read(executionId).workspaceWait;
		} catch {
			return undefined;
		}
	}

	private failRun(executionId: string, reason: string): void {
		this.logWriter.writeExecution(
			executionId,
			`Execution failed while waiting for its workspace: ${reason}`,
			'error'
		);
		this.store.update(executionId, { lastError: reason, workspaceWait: undefined });
		this.store.markExecutionFailed(executionId);
	}
}
