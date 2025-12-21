import type { WorkspacesData } from '@shared';

import { workspacesApi } from './workspaces.api';

/**
 * ===========================================================================================
 * WORKSPACES SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspaces.
 * Responsibilities:
 * - Call API endpoints
 * - Transform data if needed
 * - Handle errors
 *
 * Does NOT contain:
 * - React hooks (in useWorkspaces)
 * - UI components
 *
 * ===========================================================================================
 */

export class WorkspacesService {
	/**
	 * Get all workspaces
	 */
	async getWorkspaces(): Promise<WorkspacesData> {
		return workspacesApi.getWorkspaces();
	}
}

// Export singleton instance
export const workspacesService = new WorkspacesService();
