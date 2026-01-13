import { useCallback, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';

import { tasksApi } from './tasks.api';

/**
 * ===========================================================================================
 * USE TASKS CRUD HOOK - CRUD Operations Only (No Data Fetching)
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
 * const { deleteTask, bulkDeleteTasks } = useTasksCrud();
 *
 * // After mutation, refresh Data2 via cache control
 * await deleteTask(id);
 * cache.actions.refresh(); // Triggers Data2 refetch
 * ```
 *
 * ===========================================================================================
 */

export interface UseTasksCrudResult {
	// Operations
	deleteTask: (id: string) => Promise<void>;
	bulkDeleteTasks: (ids: string[]) => Promise<BulkDeleteResponse>;

	// Operation states
	operationError: string | null;
	clearOperationError: () => void;
}

export function useTasksCrud(): UseTasksCrudResult {
	const [operationError, setOperationError] = useState<string | null>(null);

	/**
	 * Delete a task
	 */
	const deleteTask = async (id: string) => {
		try {
			setOperationError(null);
			await tasksApi.deleteTask(id);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to delete task';
			setOperationError(message);
			console.error('Error deleting task:', err);
			throw err;
		}
	};

	/**
	 * Bulk delete tasks
	 */
	const bulkDeleteTasks = useCallback(async (ids: string[]) => {
		const result = await tasksApi.bulkDeleteTasks(ids);
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
		deleteTask,
		bulkDeleteTasks,

		// Operation states
		operationError,
		clearOperationError,
	};
}
