export interface WorkspaceProvider {
	allocate(request: WorkspaceRequest): Promise<WorkspaceHandle>;
	/** Idempotent: releasing a handle twice must not fail. */
	release(handle: WorkspaceHandle): Promise<void>;
	/**
	 * OPTIONAL. Takes back a workspace this provider allocated for a run that was paused when the daemon restarted, so the run
	 * can continue in it. Called once per restored run, before any other run is accepted; the handle is the one `allocate`
	 * returned. Return the handle to use (normally the same one) after making `release` work for it again.
	 *
	 * Reject, with a message that says what to do, when the workspace cannot be taken back safely (the folder is gone, the
	 * slot is held by another run): the run is then failed, never continued in a workspace somebody else may use.
	 * A provider without `adopt` cannot keep a paused run across a daemon restart: `flow pause` says so.
	 */
	adopt?(request: WorkspaceAdoptRequest): Promise<WorkspaceHandle>;
}

export interface WorkspaceAdoptRequest {
	executionId: string;
	/** Absolute folder of the project the run belongs to. */
	projectDir: string;
	flow: { id: string; version: string };
	/** The handle `allocate` returned before the restart (without its `notes`). */
	handle: WorkspaceHandle;
}

export interface WorkspaceRequest {
	/** Alias of {@link executionId}, kept while providers written against the first contract are deprecated. */
	taskId: string;
	/** Id of the execution the workspace is for. */
	executionId: string;
	/** Absolute folder of the project the run belongs to (never the working directory of the daemon). */
	projectDir: string;
	/** The flow being run. */
	flow: { id: string; version: string };
	hint?: string;
	/**
	 * A provider that has no folder to give yet (every slot of a pool is claimed) calls this to say the run is WAITING, with
	 * the reason for a human. It may call it again to refresh the reason. The daemon then keeps the execution as a waiting
	 * one (no failure, no timeout) until `allocate` settles.
	 */
	onWaiting?: (info: WorkspaceWaitInfo) => void;
	/** Aborted when the run is cancelled while it waits: the provider must stop waiting and reject `allocate`. */
	signal?: AbortSignal;
}

export interface WorkspaceWaitInfo {
	/** What the run waits for and who holds it, for the execution log and `flow show`. */
	message: string;
}

export interface WorkspaceHandle {
	path: string;
	id: string;
	/**
	 * Folder where the engine writes the outputs of the execution. Absent: `path + '.meta'`, which is only safe when
	 * `path` belongs to this execution alone; a provider whose path outlives or is shared by executions must set it.
	 */
	metaDir?: string;
	/** True when the folder is shared and the flow must not modify it. Advisory: nothing is enforced. */
	readOnly?: boolean;
	/** Warnings for the execution log (for instance a dirty folder). */
	notes?: string[];
}
