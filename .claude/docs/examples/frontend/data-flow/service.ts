// @ts-nocheck - Example code, not compiled
// Service Pattern - Business logic and data transformation
// Sits between repository and UI
import { taskRepository } from './task-repository';
import { Task, TaskViewModel } from './types';

/**
 * TaskService - Business logic layer
 * - Transforms API data for UI consumption
 * - Implements business rules
 * - Coordinates multiple repository calls if needed
 */
export class TaskService {
	/**
	 * Get tasks with UI-friendly transformations
	 */
	async getTasks(): Promise<TaskViewModel[]> {
		const tasks = await taskRepository.getTasks();

		// Transform API data to view model
		return tasks.map(task => this.toViewModel(task));
	}

	/**
	 * Get tasks filtered by status
	 */
	async getTasksByStatus(status: string): Promise<TaskViewModel[]> {
		const tasks = await this.getTasks();
		return tasks.filter(task => task.status === status);
	}

	/**
	 * Complete a task (business logic)
	 */
	async completeTask(id: string): Promise<TaskViewModel> {
		// Business rule: completing a task updates status to 'done'
		const updated = await taskRepository.updateTaskStatus(id, 'done');
		return this.toViewModel(updated);
	}

	/**
	 * Transform API model to view model
	 */
	private toViewModel(task: Task): TaskViewModel {
		return {
			...task,
			// Add computed properties for UI
			isOverdue: new Date(task.dueDate) < new Date(),
			displayStatus: this.formatStatus(task.status),
			formattedDate: new Date(task.createdAt).toLocaleDateString(),
		};
	}

	/**
	 * Format status for display
	 */
	private formatStatus(status: string): string {
		const statusMap: Record<string, string> = {
			todo: 'To Do',
			in_progress: 'In Progress',
			done: 'Done',
		};
		return statusMap[status] || status;
	}
}

// Export singleton instance
export const taskService = new TaskService();
