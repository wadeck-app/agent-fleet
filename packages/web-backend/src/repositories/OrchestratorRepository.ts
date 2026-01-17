/**
 * ===========================================================================================
 * ORCHESTRATOR REPOSITORY
 * ===========================================================================================
 *
 * Fetches data from the orchestrator (library mode or HTTP API).
 * Responsibilities:
 * - Direct access via OrchestratorWrapper (library mode) or HTTP requests
 * - In-memory caching with TTL (HTTP mode only)
 * - Stale cache fallback on errors (HTTP mode only)
 *
 * Does NOT contain:
 * - Business logic (in service)
 * - Data transformation (in service)
 *
 * ===========================================================================================
 */
import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { type OrchestratorStats, OrchestratorStatsSchema, type Task } from 'shared-orch-worker/domain-types';

/**
 * Cache entry structure (used only in HTTP mode)
 */
interface CacheEntry {
	data: OrchestratorStats | null;
	timestamp: number;
}

export class OrchestratorRepository {
	private cache: CacheEntry = { data: null, timestamp: 0 };
	private orchestratorWrapper?: OrchestratorWrapper;
	private orchestratorUrl?: string;
	private cacheTtlMs: number;

	constructor(orchestratorWrapperOrUrl: OrchestratorWrapper | string, cacheTtlMs: number = 5000) {
		if (typeof orchestratorWrapperOrUrl === 'string') {
			// HTTP mode
			this.orchestratorUrl = orchestratorWrapperOrUrl;
		} else {
			// Library mode
			this.orchestratorWrapper = orchestratorWrapperOrUrl;
		}
		this.cacheTtlMs = cacheTtlMs;
	}

	/**
	 * Get orchestrator stats (library mode or API with caching)
	 * Library mode: Direct call to orchestratorWrapper
	 * HTTP mode: Returns cached data if within TTL, falls back to stale cache on error
	 */
	async getStats(): Promise<OrchestratorStats> {
		// Library mode - direct access, no caching needed
		if (this.orchestratorWrapper) {
			console.log('[OrchestratorRepository] Using library mode (direct access)');
			return this.orchestratorWrapper.getStats();
		}

		// HTTP mode - with caching
		if (!this.orchestratorUrl) {
			throw new Error('OrchestratorRepository not properly configured');
		}

		const now = Date.now();
		const cacheAge = now - this.cache.timestamp;

		// Return cached data if within TTL
		if (this.cache.data && cacheAge < this.cacheTtlMs) {
			return this.cache.data;
		}

		// Fetch fresh data
		try {
			console.log(`[OrchestratorRepository] Fetching from: ${this.orchestratorUrl}/stats`);
			const response = await fetch(`${this.orchestratorUrl}/stats`);

			if (!response.ok) {
				throw new Error(`Orchestrator API returned ${response.status}: ${response.statusText}`);
			}

			const rawData = await response.json();

			console.log('[OrchestratorRepository] Raw data received:', JSON.stringify(rawData, null, 2));

			// Validate response against schema
			const stats = OrchestratorStatsSchema.parse(rawData);

			// Update cache
			this.cache = {
				data: stats,
				timestamp: now,
			};

			return stats;
		} catch (error) {
			// If we have stale cache, return it instead of throwing
			if (this.cache.data) {
				return this.cache.data;
			}

			// No cache available, propagate error
			throw new Error(
				`Failed to fetch orchestrator stats: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Get all tasks from orchestrator (library mode or HTTP API)
	 */
	async getTasks(): Promise<Task[]> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			return this.orchestratorWrapper.getTasks();
		}

		// HTTP mode
		if (!this.orchestratorUrl) {
			throw new Error('OrchestratorRepository not properly configured');
		}

		try {
			const response = await fetch(`${this.orchestratorUrl}/tasks`);

			if (!response.ok) {
				throw new Error(`Orchestrator API returned ${response.status}: ${response.statusText}`);
			}

			const tasks = await response.json();
			return Array.isArray(tasks) ? tasks : [];
		} catch (error) {
			throw new Error(
				`Failed to fetch orchestrator tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Create a new task in orchestrator
	 */
	async createTask(
		description: string,
		priority: string,
		assignedTo?: { workerId: string; workerType?: string },
		flowId?: string,
		flowInputs?: Record<string, unknown>
	): Promise<Task> {
		// Library mode - direct access via TaskManager
		if (this.orchestratorWrapper) {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const taskManager = orchestrator.getTaskManager();

			// Create task with metadata
			const metadata: Record<string, unknown> = { priority };
			const task = await taskManager.createTask(description, metadata);

			// Update task with additional fields if provided
			if (assignedTo || flowId || flowInputs) {
				if (assignedTo) {
					task.assignedTo = assignedTo;
				}
				if (flowId) {
					task.flowId = flowId;
				}
				if (flowInputs) {
					task.flowInputs = flowInputs;
				}

				// Save updated task
				await taskManager.updateTask(task);

				// IMPORTANT: Re-route task if assignedTo was added
				// The task was initially added to global backlog, we need to remove it and add to worker queue
				if (assignedTo?.workerId) {
					// Remove from global backlog
					taskManager.removeTaskFromBacklog(task.id);
					// Add to worker queue
					taskManager.addTaskToWorkerQueue(assignedTo.workerId, task);

					// Notify idle workers about the new task
					const wsServer = orchestrator.getWsServer();
					if (wsServer) {
						wsServer.tryAssignTasksToIdleWorkers();
					}
				}
			}

			return task;
		}

		// HTTP mode - not supported for createTask
		throw new Error('HTTP mode for createTask is not supported. Backend should use library mode.');
	}

	/**
	 * Delete a task from orchestrator
	 */
	async deleteTask(taskId: string): Promise<void> {
		// Library mode - direct access via TaskManager
		if (this.orchestratorWrapper) {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const taskManager = orchestrator.getTaskManager();

			const deleted = await taskManager.deleteTask(taskId);
			if (!deleted) {
				throw new Error(`Task ${taskId} not found`);
			}
			return;
		}

		// HTTP mode - not supported for deleteTask
		throw new Error('HTTP mode for deleteTask is not supported. Backend should use library mode.');
	}

	/**
	 * Update task status
	 */
	async updateTaskStatus(taskId: string, newStatus: string): Promise<Task> {
		// Library mode - direct access via TaskManager
		if (this.orchestratorWrapper) {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const taskManager = orchestrator.getTaskManager();

			await taskManager.updateTaskStatus(taskId, newStatus as any);
			const task = taskManager.getTask(taskId);

			if (!task) {
				throw new Error(`Task ${taskId} not found`);
			}

			return task;
		}

		// HTTP mode - call orchestrator REST API
		if (!this.orchestratorUrl) {
			throw new Error('OrchestratorRepository not properly configured');
		}

		try {
			const response = await fetch(`${this.orchestratorUrl}/tasks/${taskId}/status`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ status: newStatus }),
			});

			if (!response.ok) {
				throw new Error(`Orchestrator API returned ${response.status}: ${response.statusText}`);
			}

			return (await response.json()) as Task;
		} catch (error) {
			throw new Error(
				`Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Get all workspaces from orchestrator
	 */
	async getWorkspaces(): Promise<any[]> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			return this.orchestratorWrapper.getWorkspaces();
		}

		// HTTP mode - not supported for now
		throw new Error('HTTP mode for getWorkspaces not yet implemented');
	}

	/**
	 * Get single workspace by ID
	 */
	async getWorkspace(workspaceId: string): Promise<any | null> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			return this.orchestratorWrapper.getWorkspace(workspaceId);
		}

		// HTTP mode - not supported for now
		throw new Error('HTTP mode for getWorkspace not yet implemented');
	}

	/**
	 * Get all interventions from orchestrator
	 */
	async getInterventions(): Promise<any[]> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			console.log('[OrchestratorRepository] Fetching interventions from orchestrator...');
			const interventions = await this.orchestratorWrapper.getInterventions();
			console.log(`[OrchestratorRepository] Got ${interventions.length} interventions`);
			return interventions;
		}

		// HTTP mode - not supported for now
		throw new Error('HTTP mode for getInterventions not yet implemented');
	}

	/**
	 * Get single intervention by ID
	 */
	async getIntervention(interventionId: string): Promise<any | null> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			return this.orchestratorWrapper.getIntervention(interventionId);
		}

		// HTTP mode - not supported for now
		throw new Error('HTTP mode for getIntervention not yet implemented');
	}

	/**
	 * Respond to an intervention
	 */
	async respondToIntervention(
		interventionId: string,
		response: {
			value: any;
			answeredBy: string;
			comment?: string;
		}
	): Promise<any> {
		// Library mode - direct access
		if (this.orchestratorWrapper) {
			return this.orchestratorWrapper.respondToIntervention(interventionId, response);
		}

		// HTTP mode - not supported
		throw new Error('HTTP mode for respondToIntervention not yet implemented');
	}

	/**
	 * Clear the cache (useful for testing)
	 */
	clearCache(): void {
		this.cache = { data: null, timestamp: 0 };
	}
}
