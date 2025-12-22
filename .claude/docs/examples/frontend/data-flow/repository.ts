// @ts-nocheck - Example code, not compiled
// Repository Pattern - Feature-specific data access layer
// Encapsulates all API calls for a feature
import { apiClient } from './api-client';
import { CreateTaskRequest, Task } from './types';

/**
 * TaskRepository - Feature-specific data access
 * - All API calls for tasks go through here
 * - Returns raw API data (no transformation)
 * - Single responsibility: data fetching
 */
export class TaskRepository {
	/**
	 * Fetch all tasks
	 */
	async getTasks(): Promise<Task[]> {
		return apiClient.get<Task[]>('/tasks');
	}

	/**
	 * Fetch single task by ID
	 */
	async getTask(id: string): Promise<Task> {
		return apiClient.get<Task>(`/tasks/${id}`);
	}

	/**
	 * Create new task
	 */
	async createTask(data: CreateTaskRequest): Promise<Task> {
		return apiClient.post<Task>('/tasks', data);
	}

	/**
	 * Update task status
	 */
	async updateTaskStatus(id: string, status: string): Promise<Task> {
		return apiClient.patch<Task>(`/tasks/${id}/status`, { status });
	}

	/**
	 * Delete task
	 */
	async deleteTask(id: string): Promise<void> {
		return apiClient.delete(`/tasks/${id}`);
	}
}

// Export singleton instance
export const taskRepository = new TaskRepository();
