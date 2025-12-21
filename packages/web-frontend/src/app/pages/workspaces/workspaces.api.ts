import type { WorkspacesData } from '@shared';
import { WORKSPACES_API_ROUTES } from '@shared';

import { createTypedFetch } from '@framework/api/api-base';

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
		return typedFetch('GET', '/api/workspaces/', {});
	},
} as const;
