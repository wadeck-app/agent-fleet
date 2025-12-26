import type {
	CreateTask,
	Task,
	TasksData,
	TasksListQuery,
	TasksListResponse,
	TasksQuery,
} from '@app/shared/api/tasks.contract';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

/**
 * ===========================================================================================
 * TASKS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for tasks data.
 * Responsibilities:
 * - Fetch tasks from orchestrator
 * - Transform raw task data into frontend-friendly DTO
 * - Support filtering by status, worker, and priority
 * - Calculate summary statistics
 * - Emit real-time events for task state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * Future CRUD Operations (when implemented):
 * - createTask() → emit 'task:created'
 * - updateTask() → emit 'task:updated'
 * - deleteTask() → emit 'task:deleted'
 * - updateTaskStatus() → emit 'task:status_changed'
 * - assignTask() → emit 'task:assigned'
 * - updateTaskPriority() → emit 'task:priority_changed'
 *
 * ===========================================================================================
 */

export class TasksService {
	constructor(
		private readonly orchestratorRepository: OrchestratorRepository,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Get tasks data with optional filtering
	 */
	async getTasksData(query?: TasksQuery): Promise<TasksData> {
		try {
			// Fetch tasks from orchestrator via repository (library mode or HTTP)
			console.log('[TasksService] Fetching tasks via OrchestratorRepository...');
			const rawTasks = await this.orchestratorRepository.getTasks();
			console.log(`[TasksService] Received ${Array.isArray(rawTasks) ? rawTasks.length : 0} tasks`);

			// Transform tasks to frontend format
			const tasks: Task[] = this.transformTasks(rawTasks as any[]);

			// Apply additional client-side filtering if needed
			const filteredTasks = this.applyFilters(tasks, query);

			// Calculate summary statistics
			const summary = this.calculateSummary(filteredTasks);

			const tasksData: TasksData = {
				timestamp: new Date().toISOString(),
				summary,
				tasks: filteredTasks,
			};

			return tasksData;
		} catch (error) {
			// Orchestrator is offline - return empty tasks data
			console.error('[TasksService] Failed to fetch tasks:', error);
			return {
				timestamp: new Date().toISOString(),
				summary: {
					total: 0,
					byStatus: {},
					byPriority: {},
				},
				tasks: [],
			};
		}
	}

	/**
	 * Get tasks list with pagination, sorting, and search support
	 * (New Data2 architecture)
	 */
	async getTasksList(query: TasksListQuery): Promise<TasksListResponse> {
		try {
			// Fetch all tasks from orchestrator
			console.log('[TasksService] Fetching tasks for paginated list...');
			const rawTasks = await this.orchestratorRepository.getTasks();
			let tasks: Task[] = this.transformTasks(rawTasks as any[]);

			// Apply domain filters (status, workerId, priority)
			tasks = this.applyFilters(tasks, query);

			// Apply search if provided
			if (query.search) {
				tasks = this.applySearch(tasks, query.search);
			}

			// Apply sorting if provided
			if (query.sortBy && query.sortOrder) {
				tasks = this.applySorting(tasks, query.sortBy, query.sortOrder);
			}

			// Apply pagination
			const page = query.page || 1;
			const pageSize = query.pageSize || 10;
			const total = tasks.length;
			const totalPages = Math.ceil(total / pageSize);
			const start = (page - 1) * pageSize;
			const paginatedTasks = tasks.slice(start, start + pageSize);

			return {
				items: paginatedTasks,
				pagination: {
					total,
					page,
					pageSize,
					totalPages,
				},
			};
		} catch (error) {
			// Orchestrator is offline - return empty list
			console.error('[TasksService] Failed to fetch tasks list:', error);
			return {
				items: [],
				pagination: {
					total: 0,
					page: query.page || 1,
					pageSize: query.pageSize || 10,
					totalPages: 0,
				},
			};
		}
	}

	/**
	 * Apply search filter across task fields
	 */
	private applySearch(tasks: Task[], searchQuery: string): Task[] {
		const lowerQuery = searchQuery.toLowerCase().trim();
		if (!lowerQuery) return tasks;

		return tasks.filter(
			task =>
				task.id.toLowerCase().includes(lowerQuery) ||
				task.description.toLowerCase().includes(lowerQuery) ||
				task.assignedWorker?.workerId.toLowerCase().includes(lowerQuery) ||
				task.status.toLowerCase().includes(lowerQuery) ||
				task.priority.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Apply sorting to tasks
	 */
	private applySorting(tasks: Task[], sortBy: string, sortOrder: string): Task[] {
		const isDescending = sortOrder === 'desc';

		return [...tasks].sort((a, b) => {
			const aVal = this.getTaskValue(a, sortBy);
			const bVal = this.getTaskValue(b, sortBy);

			if (aVal === null || aVal === undefined) return 1;
			if (bVal === null || bVal === undefined) return -1;

			let comparison = 0;
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return isDescending ? -comparison : comparison;
		});
	}

	/**
	 * Get task field value for sorting
	 */
	private getTaskValue(task: Task, key: string): any {
		// Handle nested properties
		if (key === 'assignedWorker') {
			return task.assignedWorker?.workerId || null;
		}

		return (task as any)[key];
	}

	/**
	 * Transform raw orchestrator tasks to frontend Task schema
	 */
	private transformTasks(rawTasks: any[]): Task[] {
		if (!Array.isArray(rawTasks)) {
			return [];
		}

		return rawTasks.map(task => ({
			id: task.id,
			description: task.description,
			status: task.status,
			priority: task.priority,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			assignedWorker: task.assignedTo
				? {
						workerId: task.assignedTo.workerId,
						workerType: task.assignedTo.workerType,
					}
				: null,
			// Flow-related fields
			flowId: task.flowId,
			flowResult: task.flowResult
				? {
						status: task.flowResult.status,
						error: task.flowResult.error,
					}
				: undefined,
		}));
	}

	/**
	 * Apply client-side filters (workerId, priority)
	 * Note: status filtering is done server-side via query param
	 */
	private applyFilters(tasks: Task[], query?: TasksQuery): Task[] {
		let filtered = tasks;

		// Filter by workerId if specified
		if (query?.workerId) {
			filtered = filtered.filter(task => task.assignedWorker?.workerId === query.workerId);
		}

		// Filter by priority if specified
		if (query?.priority) {
			filtered = filtered.filter(task => task.priority === query.priority);
		}

		return filtered;
	}

	/**
	 * Calculate summary statistics
	 */
	private calculateSummary(tasks: Task[]): {
		total: number;
		byStatus: Record<string, number>;
		byPriority: Record<string, number>;
	} {
		const byStatus: Record<string, number> = {};
		const byPriority: Record<string, number> = {};

		tasks.forEach(task => {
			// Count by status
			byStatus[task.status] = (byStatus[task.status] || 0) + 1;

			// Count by priority
			byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
		});

		return {
			total: tasks.length,
			byStatus,
			byPriority,
		};
	}

	// ===========================================================================================
	// CRUD METHODS
	// ===========================================================================================

	/**
	 * Delete a task
	 * 1. Delete task from orchestrator
	 * 2. Emit 'b2f:task:deleted' event
	 */
	async deleteTask(taskId: string): Promise<void> {
		try {
			await this.orchestratorRepository.deleteTask(taskId);

			// Emit event AFTER successful deletion
			this.eventBroadcaster.broadcast('b2f:task:deleted', { id: taskId } as any);
		} catch (error) {
			console.error('[TasksService] Failed to delete task:', error);
			throw error;
		}
	}

	/**
	 * Create a new task
	 * 1. Validate input
	 * 2. Create task in orchestrator
	 * 3. Emit 'b2f:task:created' event
	 * 4. Return created task
	 */
	async createTask(data: CreateTask): Promise<Task> {
		try {
			// Validate input
			const errors: string[] = [];

			if (!data.description?.trim()) {
				errors.push('Description is required');
			}
			if (!data.priority) {
				errors.push('Priority is required');
			}
			if (!data.assignedTo?.workerId) {
				errors.push('Worker assignment is required');
			}

			if (errors.length > 0) {
				throw new Error(errors.join(', '));
			}

			// Create task via OrchestratorRepository (library mode)
			const task = await this.orchestratorRepository.createTask(
				data.description,
				data.priority,
				data.assignedTo,
				data.flowId,
				data.flowInputs
			);

			// Transform to frontend format
			const transformedTask = this.transformTasks([task])[0];

			// Emit event AFTER successful creation
			this.eventBroadcaster.broadcast('b2f:task:created', transformedTask);

			return transformedTask;
		} catch (error) {
			console.error('[TasksService] Failed to create task:', error);
			throw error;
		}
	}

	/**
	 * Update task status (PLACEHOLDER - not implemented)
	 * When implemented, this should:
	 * 1. Fetch current task
	 * 2. Store previous status
	 * 3. Update status in orchestrator
	 * 4. Emit 'task:status_changed' event with both old and new status
	 * 5. Return updated task
	 *
	 * @example
	 * ```typescript
	 * async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<Task> {
	 *   try {
	 *     const currentTask = await this.orchestratorRepository.getTask(taskId);
	 *     const previousStatus = currentTask.status;
	 *
	 *     const updatedTask = await this.orchestratorRepository.updateTaskStatus(taskId, newStatus);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('task:status_changed', {
	 *       taskId: updatedTask.id,
	 *       task: updatedTask,
	 *       previousStatus,
	 *     });
	 *
	 *     return updatedTask;
	 *   } catch (error) {
	 *     console.error('[TasksService] Failed to update task status:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Assign task to worker (PLACEHOLDER - not implemented)
	 * When implemented, emit 'task:assigned' event
	 *
	 * @example
	 * ```typescript
	 * async assignTask(taskId: string, workerId: string): Promise<Task> {
	 *   try {
	 *     const task = await this.orchestratorRepository.assignTask(taskId, workerId);
	 *
	 *     // Emit event AFTER successful assignment
	 *     this.eventBroadcaster.broadcast('task:assigned', {
	 *       taskId: task.id,
	 *       workerId,
	 *       assignedAt: Date.now(),
	 *     });
	 *
	 *     return task;
	 *   } catch (error) {
	 *     console.error('[TasksService] Failed to assign task:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Update task priority (PLACEHOLDER - not implemented)
	 * When implemented, emit 'task:priority_changed' event
	 *
	 * @example
	 * ```typescript
	 * async updateTaskPriority(taskId: string, newPriority: TaskPriority): Promise<Task> {
	 *   try {
	 *     const currentTask = await this.orchestratorRepository.getTask(taskId);
	 *     const oldPriority = currentTask.priority;
	 *
	 *     const task = await this.orchestratorRepository.updateTaskPriority(taskId, newPriority);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('task:priority_changed', {
	 *       taskId: task.id,
	 *       oldPriority,
	 *       newPriority,
	 *     });
	 *
	 *     return task;
	 *   } catch (error) {
	 *     console.error('[TasksService] Failed to update task priority:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Delete task (PLACEHOLDER - not implemented)
	 * When implemented, emit 'task:deleted' event
	 *
	 * @example
	 * ```typescript
	 * async deleteTask(taskId: string): Promise<void> {
	 *   try {
	 *     await this.orchestratorRepository.deleteTask(taskId);
	 *
	 *     // Emit event AFTER successful deletion
	 *     this.eventBroadcaster.broadcast('task:deleted', {
	 *       id: taskId,
	 *       deletedAt: Date.now(),
	 *     } as any); // Type assertion needed as Task requires all fields
	 *
	 *   } catch (error) {
	 *     console.error('[TasksService] Failed to delete task:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */
}
