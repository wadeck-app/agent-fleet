import type { TasksData, Task, TasksQuery } from '@app/shared';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';

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
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * ===========================================================================================
 */

export class TasksService {
	constructor(private readonly orchestratorRepository: OrchestratorRepository) {}

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
			const tasks: Task[] = this.transformTasks(rawTasks);

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
	private calculateSummary(
		tasks: Task[]
	): { total: number; byStatus: Record<string, number>; byPriority: Record<string, number> } {
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
	 * Get orchestrator URL from environment or default
	 */
	private getOrchestratorUrl(): string {
		return process.env.ORCHESTRATOR_URL || 'http://localhost:3737';
	}
}
