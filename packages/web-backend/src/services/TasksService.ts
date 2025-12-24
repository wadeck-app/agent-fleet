import { getOrchestratorRestUrl } from 'shared-common/PortCalculator';

import type { Task, TasksData, TasksQuery } from '@app/shared/api/tasks.contract';

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
			// Fetch tasks from orchestrator
			const orchestratorUrl = this.getOrchestratorUrl();
			const tasksUrl = this.buildTasksUrl(orchestratorUrl, query);

			console.log(`[TasksService] Fetching tasks from: ${tasksUrl}`);
			const response = await fetch(tasksUrl);

			if (!response.ok) {
				throw new Error(`Orchestrator tasks API returned ${response.status}: ${response.statusText}`);
			}

			const rawTasks = await response.json();
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

	/**
	 * Build tasks URL with optional query parameters
	 */
	private buildTasksUrl(baseUrl: string, query?: TasksQuery): string {
		const url = new URL('/tasks', baseUrl);

		if (query?.status) {
			url.searchParams.append('status', query.status);
		}

		return url.toString();
	}

	/**
	 * Get orchestrator URL from environment or calculate from WORKSPACE_ID/PROJECT_ID
	 */
	private getOrchestratorUrl(): string {
		if (process.env.ORCHESTRATOR_URL) {
			return process.env.ORCHESTRATOR_URL;
		}

		// Fall back to calculating from WORKSPACE_ID and PROJECT_ID
		return getOrchestratorRestUrl('localhost');
	}

	// ===========================================================================================
	// CRUD METHODS (TO BE IMPLEMENTED)
	// ===========================================================================================
	// When CRUD operations are implemented, use these as templates for event emission

	/**
	 * Create a new task (PLACEHOLDER - not implemented)
	 * When implemented, this should:
	 * 1. Validate input
	 * 2. Create task in orchestrator
	 * 3. Emit 'task:created' event
	 * 4. Return created task
	 *
	 * @example
	 * ```typescript
	 * async createTask(data: CreateTaskDto): Promise<Task> {
	 *   try {
	 *     const task = await this.orchestratorRepository.createTask(data);
	 *
	 *     // Emit event AFTER successful creation
	 *     this.eventBroadcaster.broadcast('task:created', task);
	 *
	 *     return task;
	 *   } catch (error) {
	 *     console.error('[TasksService] Failed to create task:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

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
