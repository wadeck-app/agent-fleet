import { createLogger } from 'shared-common/logger';

import type {
	CreateTask,
	LogEntry,
	LogLevel,
	PaginatedLogsQuery,
	PaginatedLogsResponse,
	Task,
	TasksData,
	TasksListQuery,
	TasksListResponse,
	TasksQuery,
} from '@app/shared/api/tasks.contract';
import type { BulkDeleteResponse, FailedDeletion } from '@app/shared/common/api-helpers';
import { B2F_TASKS_UPDATED, B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@app/shared/transport';

import { TraceChunkStorage } from '../../../orchestrator/src/core/TraceChunkStorage';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { TasksRepository } from '../repositories/TasksRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { FlowsService } from './FlowsService';

const log = createLogger('TasksService');

/**
 * ===========================================================================================
 * TASKS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for tasks data.
 * Responsibilities:
 * - Fetch tasks from backend storage (TasksRepository)
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
 * CRUD Operations:
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
	private readonly traceStorage: TraceChunkStorage;

	constructor(
		private readonly tasksRepository: TasksRepository,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly orchestratorRepository: OrchestratorRepository,
		private readonly flowsService: FlowsService
	) {
		// Use the same data directory as the orchestrator
		this.traceStorage = new TraceChunkStorage('./data/tasks');
	}

	/**
	 * Get tasks data with optional filtering
	 */
	async getTasksData(query?: TasksQuery): Promise<TasksData> {
		try {
			// Fetch tasks from TasksRepository (already in correct format)
			log.info('Fetching tasks via TasksRepository...');
			const tasks = await this.tasksRepository.findAll(query);
			log.info(`Received ${tasks.length} tasks`);

			// Calculate summary statistics
			const summary = this.calculateSummary(tasks);

			const tasksData: TasksData = {
				timestamp: new Date().toISOString(),
				summary,
				tasks,
			};

			return tasksData;
		} catch (error) {
			// Storage is unavailable - return empty tasks data
			log.error('Failed to fetch tasks:', error);
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
			// Fetch all tasks from TasksRepository (already in correct format)
			log.info('Fetching tasks for paginated list...');
			let tasks = await this.tasksRepository.findAll(query);

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
			// Storage is unavailable - return empty list
			log.error('Failed to fetch tasks list:', error);
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
	 * Helper function for partial string matching (case-insensitive, trimmed)
	 * Returns true if value contains query string (after trimming and lowercasing both)
	 * Returns true if query is empty/undefined (no filtering)
	 * Returns false if value is undefined/null but query is not empty
	 */
	private matchesPartialString(value: string | undefined | null, query: string | undefined): boolean {
		if (!query) return true;

		const trimmedQuery = query.toLowerCase().trim();
		if (!trimmedQuery) return true;

		if (!value) return false;

		return value.toLowerCase().includes(trimmedQuery);
	}

	/**
	 * Apply search filter across task fields
	 */
	private applySearch(tasks: Task[], searchQuery: string): Task[] {
		const lowerQuery = searchQuery.toLowerCase().trim();
		if (!lowerQuery) return tasks;

		return tasks.filter(
			task =>
				this.matchesPartialString(task.id, searchQuery) ||
				this.matchesPartialString(task.description, searchQuery) ||
				this.matchesPartialString(task.assignedWorker?.workerId, searchQuery) ||
				this.matchesPartialString(task.status, searchQuery) ||
				this.matchesPartialString(task.priority, searchQuery) ||
				this.matchesPartialString(task.flowId, searchQuery)
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
	 * 1. Delete task from TasksRepository
	 * 2. Emit 'b2f:task:deleted' event
	 */
	async deleteTask(taskId: string): Promise<void> {
		try {
			await this.tasksRepository.delete(taskId);

			// Emit specific event AFTER successful deletion
			this.eventBroadcaster.broadcast(B2F_TASK_DELETED, { id: taskId } as any);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
		} catch (error) {
			log.error('Failed to delete task:', error);
			throw error;
		}
	}

	/**
	 * Bulk delete tasks (best-effort approach)
	 * Returns detailed results for each ID
	 */
	async bulkDeleteTasks(ids: string[]): Promise<BulkDeleteResponse> {
		const deleted: string[] = [];
		const failed: FailedDeletion[] = [];

		for (const id of ids) {
			try {
				await this.tasksRepository.delete(id);
				deleted.push(id);
			} catch (error) {
				failed.push({
					id,
					reason: error instanceof Error ? error.message : 'Unknown error',
					code: 'DELETE_FAILED',
				});
			}
		}

		// Emit events after bulk deletion
		if (deleted.length > 0) {
			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
		}

		return {
			success: true,
			deleted,
			failed,
			totalRequested: ids.length,
			totalDeleted: deleted.length,
			totalFailed: failed.length,
		};
	}

	/**
	 * Update task status
	 * 1. Update task status in TasksRepository
	 * 2. Emit 'b2f:task:updated' and 'b2f:tasks:updated' events
	 */
	async updateTaskStatus(taskId: string, newStatus: string): Promise<Task> {
		try {
			const task = await this.tasksRepository.updateStatus(taskId, newStatus);

			// Emit filtered event for task detail pages
			// Payload includes taskId for server-side filtering
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TASK_UPDATED, { taskId } as any);

			// Emit aggregate event for dashboard/board updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);

			return task;
		} catch (error) {
			log.error('Failed to update task status:', error);
			throw error;
		}
	}

	/**
	 * Create a new task
	 * 1. Validate input
	 * 2. Create task in TasksRepository
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

			// Validate flow inputs if flowId is provided
			if (data.flowId && data.flowInputs) {
				const flowInputErrors = await this.validateFlowInputs(data.flowId, data.flowInputs);
				errors.push(...flowInputErrors);
			}

			if (errors.length > 0) {
				throw new Error(errors.join(', '));
			}

			// Map CreateTask to Task fields (assignedTo → assignedWorker)
			const task = await this.tasksRepository.create({
				description: data.description,
				status: 'backlog',
				priority: data.priority,
				assignedWorker: {
					workerId: data.assignedTo.workerId,
				},
				flowId: data.flowId,
				flowInputs: data.flowInputs,
				projectId: data.projectId,
				workspaceId: data.workspaceId,
			});

			// Enqueue task in orchestrator for assignment to worker
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.orchestratorRepository.enqueueTask(task as any);
				log.info(`Task ${task.id} enqueued to orchestrator`);
			} catch (error) {
				log.error('Failed to enqueue task to orchestrator:', error);
				// Don't fail the task creation if orchestrator is unavailable
			}

			// Emit specific event AFTER successful creation
			this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);

			return task;
		} catch (error) {
			log.error('Failed to create task:', error);
			throw error;
		}
	}

	/**
	 * Validate flow inputs against flow metadata
	 * @param flowId - Flow ID to validate against
	 * @param flowInputs - Input values provided by user
	 * @returns Array of validation error messages
	 */
	private async validateFlowInputs(flowId: string, flowInputs: Record<string, any>): Promise<string[]> {
		const errors: string[] = [];

		try {
			// Get all flows to find the flow metadata
			const flowsByProject = await this.flowsService.getFlows();

			// Search for the flow across all projects
			let flowMetadata: any = null;
			for (const projectId of Object.keys(flowsByProject)) {
				const projectFlows = flowsByProject[projectId];
				if (projectFlows[flowId]) {
					flowMetadata = projectFlows[flowId];
					break;
				}
			}

			if (!flowMetadata) {
				errors.push(`Flow '${flowId}' not found`);
				return errors;
			}

			// Validate required inputs are provided
			for (const [inputName, inputDef] of Object.entries(flowMetadata.inputs || {})) {
				const def = inputDef as any;

				// Check if required input is missing
				if (def.required && (flowInputs[inputName] === undefined || flowInputs[inputName] === null)) {
					errors.push(`Required input '${inputName}' is missing`);
				}

				// Validate input type if provided
				if (flowInputs[inputName] !== undefined && flowInputs[inputName] !== null) {
					const actualType = typeof flowInputs[inputName];
					const expectedType = def.type;

					// Basic type checking
					if (expectedType === 'string' && actualType !== 'string') {
						errors.push(`Input '${inputName}' must be a string`);
					} else if (expectedType === 'number' && actualType !== 'number') {
						errors.push(`Input '${inputName}' must be a number`);
					} else if (expectedType === 'boolean' && actualType !== 'boolean') {
						errors.push(`Input '${inputName}' must be a boolean`);
					} else if (expectedType === 'object' && actualType !== 'object') {
						errors.push(`Input '${inputName}' must be an object`);
					}
				}
			}
		} catch (error) {
			log.error('Error validating flow inputs:', error);
			errors.push('Unable to validate flow inputs');
		}

		return errors;
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

	// ===========================================================================================
	// LOGS METHODS
	// ===========================================================================================

	/**
	 * Get a single task by ID with full flowResult including trace
	 */
	async getTaskById(taskId: string): Promise<Task | null> {
		try {
			log.info(`Fetching task ${taskId} with full trace...`);
			const task = await this.tasksRepository.findById(taskId);

			if (!task) {
				return null;
			}

			return task;
		} catch (error) {
			log.error(`Failed to fetch task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Get paginated logs for a task
	 * Converts FlowTrace.steps to LogEntry[] with chunking/pagination
	 */
	async getTaskLogs(taskId: string, query: PaginatedLogsQuery): Promise<PaginatedLogsResponse> {
		try {
			log.info(`Fetching logs for task ${taskId}, cursor=${query.cursor}, limit=${query.limit}`);

			// Get task to check status
			const task = await this.getTaskById(taskId);

			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			// Check if task is still running
			const isRunning = task.status === 'in_progress' || task.status === 'testing';

			// Use TraceChunkStorage to read logs efficiently
			const {
				logs: steps,
				nextCursor: stepsCursor,
				total: stepsTotal,
			} = await this.traceStorage.readLogsPaginated(taskId, query.cursor || 0, query.limit || 500);

			if (steps.length === 0) {
				return {
					logs: [],
					nextCursor: null,
					total: 0,
					isRunning,
				};
			}

			// Convert steps to log entries with server-side timestamps
			let allLogs: LogEntry[] = [];
			let logCounter = 0; // Counter for unique IDs within this batch

			steps.forEach((step: any) => {
				// Main step entry
				const stepLog: LogEntry = {
					id: `${taskId}-${step.stepId}-${logCounter++}`,
					timestamp: step.startTime,
					level: this.inferLogLevel(step),
					message: this.formatStepMessage(step),
					stepId: step.stepId,
					stepName: step.stepName,
					stepType: step.stepType,
					metadata: {
						durationMs: step.durationMs,
						model: step.model,
						exitCode: step.exitCode,
					},
				};
				allLogs.push(stepLog);

				// When liveLogEntries are present, use them instead of legacy entries
				const hasLiveLogEntries = Array.isArray(step.liveLogEntries) && step.liveLogEntries.length > 0;

				if (hasLiveLogEntries) {
					// Convert liveLogEntries to LogEntry format
					for (const entry of step.liveLogEntries) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-live-${logCounter++}`,
							timestamp: entry.timestamp,
							level: entry.level as LogLevel,
							message: entry.message,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { ...entry.metadata, eventType: entry.eventType, source: 'stream-json' },
						});
					}

					// Still include stderr if present (not covered by stream-json)
					if (step.stderr) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-${logCounter++}`,
							timestamp: step.endTime || step.startTime + 4,
							level: 'error' as LogLevel,
							message: `stderr: ${step.stderr.substring(0, 200)}${step.stderr.length > 200 ? '...' : ''}`,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { fullStderr: step.stderr },
						});
					}
				} else {
					// Legacy path: add additional logs for detailed output
					if (step.prompt) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-${logCounter++}`,
							timestamp: step.startTime + 1, // Slight offset for ordering within step

							level: 'debug' as LogLevel,
							message: `Prompt: ${step.prompt.substring(0, 200)}${step.prompt.length > 200 ? '...' : ''}`,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { fullPrompt: step.prompt },
						});
					}

					if (step.response) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-${logCounter++}`,
							timestamp: step.endTime || step.startTime + 2,
							level: 'info' as LogLevel,
							message: `Response: ${step.response.substring(0, 200)}${step.response.length > 200 ? '...' : ''}`,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { fullResponse: step.response },
						});
					}

					if (step.stdout) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-${logCounter++}`,
							timestamp: step.endTime || step.startTime + 3,
							level: 'info' as LogLevel,
							message: `stdout: ${step.stdout.substring(0, 200)}${step.stdout.length > 200 ? '...' : ''}`,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { fullStdout: step.stdout },
						});
					}

					if (step.stderr) {
						allLogs.push({
							id: `${taskId}-${step.stepId}-${logCounter++}`,
							timestamp: step.endTime || step.startTime + 4,
							level: 'error' as LogLevel,
							message: `stderr: ${step.stderr.substring(0, 200)}${step.stderr.length > 200 ? '...' : ''}`,
							stepId: step.stepId,
							stepName: step.stepName,
							stepType: step.stepType,
							metadata: { fullStderr: step.stderr },
						});
					}
				}
			});

			// Apply filters
			if (query.level) {
				allLogs = allLogs.filter(log => log.level === query.level);
			}

			if (query.search) {
				const searchLower = query.search.toLowerCase();
				allLogs = allLogs.filter(log => log.message.toLowerCase().includes(searchLower));
			}

			// Note: Pagination already done by TraceChunkStorage
			// Logs are ordered by timestamp (server-side) for correct display
			return {
				logs: allLogs,
				nextCursor: stepsCursor,
				total: stepsTotal,
				isRunning,
			};
		} catch (error) {
			log.error(`Failed to fetch logs for task ${taskId}:`, error);
			throw error;
		}
	}

	/**
	 * Infer log level from step result
	 */
	private inferLogLevel(step: any): LogLevel {
		// Script steps with non-zero exit code = error
		if (step.stepType === 'script' && step.exitCode && step.exitCode !== 0) {
			return 'error';
		}

		// Steps with stderr = warning or error
		if (step.stderr) {
			return 'warning';
		}

		// Default to info
		return 'info';
	}

	/**
	 * Format step message for display
	 */
	private formatStepMessage(step: any): string {
		const duration = step.durationMs ? ` (${step.durationMs}ms)` : '';

		if (step.stepType === 'model') {
			return `[${step.stepName}] Model: ${step.model}${duration}`;
		}

		if (step.stepType === 'script') {
			const exitStatus = step.exitCode !== undefined ? ` [exit ${step.exitCode}]` : '';
			return `[${step.stepName}] Script executed${exitStatus}${duration}`;
		}

		if (step.stepType === 'subflow') {
			return `[${step.stepName}] SubFlow: ${step.subFlowId}${duration}`;
		}

		return `[${step.stepName}] ${step.stepType}${duration}`;
	}

	/**
	 * Write trace data incrementally to storage
	 * Used for real-time trace updates from orchestrator
	 */
	async writeTrace(taskId: string, trace: any): Promise<void> {
		try {
			log.info(`Writing trace for task ${taskId}, steps count: ${trace.steps?.length || 0}`);
			await this.traceStorage.writeTraceIncremental(taskId, trace);
			log.info(`Successfully wrote trace for task ${taskId}`);
		} catch (error) {
			log.error(`Failed to write trace for task ${taskId}:`, error);
			throw error;
		}
	}
}
