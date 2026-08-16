import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';

// @plugin-009-exempt: no-taskId-path-construction
export const noneWorkspaceProvider: WorkspaceProvider = {
	async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
		return { path: process.cwd(), id: `none:${request.taskId}` };
	},
	async release(_handle: WorkspaceHandle): Promise<void> {
		// no-op
	},
};
