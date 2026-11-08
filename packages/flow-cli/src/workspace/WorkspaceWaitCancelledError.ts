/** A run that was waiting for a workspace was cancelled: the provider stopped waiting. Not a failure of the provider. */
export class WorkspaceWaitCancelledError extends Error {
	readonly code = 'WORKSPACE_WAIT_CANCELLED';

	constructor(executionId: string) {
		super(`The wait for a workspace of execution ${executionId} was cancelled; no workspace was claimed.`);
		this.name = 'WorkspaceWaitCancelledError';
	}
}
