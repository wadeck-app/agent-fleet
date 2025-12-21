import type { TasksData, TasksQuery } from '@shared';

import { tasksApi } from './tasks.api';

/**
 * ===========================================================================================
 * TASKS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for tasks.
 * Responsibilities:
 * - Call API endpoints
 * - Transform data if needed
 * - Handle errors
 *
 * Does NOT contain:
 * - React hooks (in useTasks)
 * - UI components
 *
 * ===========================================================================================
 */

export class TasksService {
	/**
	 * Get all tasks with optional filters
	 */
	async getTasks(query?: TasksQuery): Promise<TasksData> {
		return tasksApi.getTasks(query);
	}
}

// Export singleton instance
export const tasksService = new TasksService();
