import { createTypedFetch } from '@framework/api/api-base';
import { WORKSPACES_API_ROUTES } from '@shared/api/workspaces.contract';
import type {
	CreateWorkspaceDto,
	UpdateWorkspaceDto,
	Workspace,
	WorkspacesData,
	WorkspacesListQuery,
	WorkspacesListResponse,
} from '@shared/api/workspaces.contract';

/**
 * ===========================================================================================
 * WORKSPACES API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for workspaces endpoints.
 * Generated from the WORKSPACES_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(WORKSPACES_API_ROUTES);

export const workspacesApi = {
	getWorkspaces: (): Promise<WorkspacesData> => {
		return typedFetch('GET', '/api/workspaces/', {}) as Promise<WorkspacesData>;
	},

	/**
	 * Get workspaces list with pagination support (new Data2 architecture)
	 */
	getWorkspacesList: (query: WorkspacesListQuery): Promise<WorkspacesListResponse> => {
		return typedFetch('GET', '/api/workspaces/', { query }) as Promise<WorkspacesListResponse>;
	},

	/**
	 * Create a new workspace
	 */
	createWorkspace: (data: CreateWorkspaceDto): Promise<Workspace> => {
		return typedFetch('POST', '/api/workspaces/', {
			body: data,
		}) as Promise<Workspace>;
	},

	/**
	 * Update workspace metadata (name, description)
	 */
	updateWorkspace: (workspaceId: string, data: UpdateWorkspaceDto): Promise<Workspace> => {
		return typedFetch('PATCH', '/api/workspaces/:id', {
			params: { id: workspaceId },
			body: data,
		}) as Promise<Workspace>;
	},
} as const;
