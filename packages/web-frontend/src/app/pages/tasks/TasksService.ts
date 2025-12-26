import type { CreateTask, Task, TasksData, TasksQuery } from '@shared/api/tasks.contract';

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

	/**
	 * Create a new task
	 */
	async createTask(data: CreateTask): Promise<Task> {
		return tasksApi.createTask(data);
	}

	/**
	 * Delete a task
	 */
	async deleteTask(taskId: string): Promise<void> {
		await tasksApi.deleteTask(taskId);
	}
}

// Export singleton instance
export const tasksService = new TasksService();
