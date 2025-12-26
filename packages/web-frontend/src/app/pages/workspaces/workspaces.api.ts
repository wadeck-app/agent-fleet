import { createTypedFetch } from '@framework/api/api-base';
import { WORKSPACES_API_ROUTES } from '@shared/api/workspaces.contract';
import type { WorkspacesData, WorkspacesListQuery, WorkspacesListResponse } from '@shared/api/workspaces.contract';

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
} as const;
