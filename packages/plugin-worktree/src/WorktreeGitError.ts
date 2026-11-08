/** Why a git setup failed, found by probing git after the command failed. */
export type WorktreeGitFailureCause = 'git-not-installed' | 'not-a-repository' | 'no-commits' | 'git-command-failed';

/**
 * The git side of a worktree could not be set up. `code` is the one the daemon sends to the client: the run is refused
 * with the cause, the project folder and the fix, never started in a folder without the project's files.
 */
export class WorktreeGitError extends Error {
	readonly code = 'WORKSPACE_GIT_FAILED';

	constructor(
		message: string,
		readonly failureCause: WorktreeGitFailureCause
	) {
		super(message);
		this.name = 'WorktreeGitError';
	}
}
