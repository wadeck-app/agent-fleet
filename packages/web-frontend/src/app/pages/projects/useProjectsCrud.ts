import { useCallback, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';

import { projectsApi } from './projects.api';

/**
 * ===========================================================================================
 * USE PROJECTS CRUD HOOK - CRUD Operations Only (No Data Fetching)
 * ===========================================================================================
 *
 * Responsibilities:
 * - Provide CRUD operations (delete, bulkDelete)
 * - Track operation-specific states (operationError)
 * - NO automatic data fetching (Data2 handles that)
 *
 * Benefits:
 * - Clean separation: Data2 handles fetching, this hook handles mutations
 * - Avoids double fetching when used with Data2
 * - Reusable across different pages (table, grid, etc.)
 * - Operations can trigger Data2 refresh via cache control
 *
 * Usage:
 * ```tsx
 * const { deleteProject, bulkDeleteProjects } = useProjectsCrud();
 *
 * // After mutation, refresh Data2 via cache control
 * await deleteProject(id);
 * cache.actions.refresh(); // Triggers Data2 refetch
 * ```
 *
 * ===========================================================================================
 */

export interface UseProjectsCrudResult {
	// Operations
	deleteProject: (id: string) => Promise<void>;
	bulkDeleteProjects: (ids: string[]) => Promise<BulkDeleteResponse>;

	// Operation states
	operationError: string | null;
	clearOperationError: () => void;
}

export function useProjectsCrud(): UseProjectsCrudResult {
	const [operationError, setOperationError] = useState<string | null>(null);

	/**
	 * Delete a project
	 */
	const deleteProject = async (id: string) => {
		try {
			setOperationError(null);
			await projectsApi.deleteProject(id);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to delete project';
			setOperationError(message);
			console.error('Error deleting project:', err);
			throw err;
		}
	};

	/**
	 * Bulk delete projects
	 */
	const bulkDeleteProjects = useCallback(async (ids: string[]) => {
		const result = await projectsApi.bulkDeleteProjects(ids);
		// Caller should trigger Data2 refresh via cache.actions.refresh()
		return result;
	}, []);

	/**
	 * Clear the current operation error
	 */
	const clearOperationError = () => {
		setOperationError(null);
	};

	return {
		// Operations
		deleteProject,
		bulkDeleteProjects,

		// Operation states
		operationError,
		clearOperationError,
	};
}
