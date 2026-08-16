export interface WorkspaceProvider {
	allocate(request: WorkspaceRequest): Promise<WorkspaceHandle>;
	release(handle: WorkspaceHandle): Promise<void>;
}

export interface WorkspaceRequest {
	taskId: string;
	hint?: string;
}

export interface WorkspaceHandle {
	path: string;
	id: string;
}
