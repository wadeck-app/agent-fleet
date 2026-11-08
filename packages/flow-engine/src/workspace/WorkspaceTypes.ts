/** Shared workspace types -- imported by WorkspaceManager, WorkspaceGitStrategy, WorkspacePruner. */

export class WorkspaceAllocationError extends Error {
	constructor(message: string) {
		super(`Workspace allocation error: ${message}`);
		this.name = 'WorkspaceAllocationError';
	}
}

/** Why a git setup failed. Detected by probes (`git --version`, `git rev-parse`), not by reading git's text. */
export type WorkspaceGitFailureCause =
	| 'git-not-installed'
	| 'not-a-repository'
	| 'no-commits'
	| 'branch-missing'
	| 'unknown-strategy'
	| 'git-command-failed';

/** The git setup of a workspace failed: the allocation is refused (the run must not start in an empty directory). */
export class WorkspaceGitSetupError extends WorkspaceAllocationError {
	/** Code the daemon sends to the client with the refusal. */
	readonly code = 'WORKSPACE_GIT_FAILED';

	constructor(
		message: string,
		readonly failureCause: WorkspaceGitFailureCause
	) {
		super(message);
		this.name = 'WorkspaceGitSetupError';
	}
}

export interface WorkspaceAllocationOptions {
	taskId: string;
	config: import('../types').WorkspaceConfig;
	basePath?: string;
	gitBranch?: string;
	existingPath?: string;
	taskMetadata?: Record<string, unknown>;
	autoCreate?: boolean;
}
