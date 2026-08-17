/** Shared workspace types — imported by WorkspaceManager, WorkspaceGitStrategy, WorkspacePruner. */

export class WorkspaceAllocationError extends Error {
	constructor(message: string) {
		super(`Workspace allocation error: ${message}`);
		this.name = 'WorkspaceAllocationError';
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
