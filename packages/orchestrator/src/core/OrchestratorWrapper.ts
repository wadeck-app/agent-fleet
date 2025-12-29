/**
 * ===========================================================================================
 * LIBRARY MODE ADAPTER
 * ===========================================================================================
 *
 * Direct in-process access to Orchestrator.
 * Zero serialization overhead, direct method calls.
 *
 * Features:
 * - Direct access to TaskManager and WorkerWebSocketServer
 * - EventEmitter integration for O→B events
 * - Type-safe method delegation
 * - No network overhead
 *
 * ===========================================================================================
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import type { Orchestrator } from 'orchestrator/core/Orchestrator';
import path from 'path';
import { StateEvent } from 'shared-orch-worker/StateManager';
import type { OrchestratorStats, Task, WorkerInfo } from 'shared-orch-worker/domain-types';
import type { O2BEventData, O2BEventType } from 'shared-orch-worker/orchestrator-events';

// @formatter:off
// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const ORCHESTRATOR_VERSION = packageJson.version;
// @formatter:on

/**
 * Task filters for getTasks()
 */
export interface TaskFilters {
	status?: string;
	workerId?: string;
	priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Worker filters for getWorkers()
 */
export interface WorkerFilters {
	status?: 'idle' | 'busy';
}

/**
 * Library Mode Adapter - Direct access to orchestrator
 */
export class OrchestratorWrapper {
	constructor(private readonly orchestrator: Orchestrator) {
		if (!orchestrator) {
			throw new Error('OrchestratorWrapper requires an Orchestrator instance');
		}
		this.orchestrator = orchestrator;
	}

	// ===========================================================================================
	// B→O REQUEST METHODS (Direct delegation to TaskManager/WorkerWebSocketServer)
	// ===========================================================================================

	/**
	 * Create a new task
	 */
	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		const taskManager = this.orchestrator.getTaskManager();
		return await taskManager.createTask(description, metadata || {});
	}

	/**
	 * Get a task by ID
	 */
	async getTask(taskId: string): Promise<Task | null> {
		const taskManager = this.orchestrator.getTaskManager();
		const task = taskManager.getTask(taskId);
		return task || null;
	}

	/**
	 * Get all tasks with optional filters
	 */
	async getTasks(filters?: TaskFilters): Promise<Task[]> {
		const taskManager = this.orchestrator.getTaskManager();
		const allTasks = taskManager.getAllTasks();

		if (!filters) {
			return allTasks;
		}

		// Apply filters
		return allTasks.filter((task: Task) => {
			// Filter by status
			if (filters.status && task.status !== filters.status) {
				return false;
			}

			// Filter by workerId
			if (filters.workerId && task.assignedTo?.workerId !== filters.workerId) {
				return false;
			}

			// Filter by priority
			if (filters.priority && task.priority !== filters.priority) {
				return false;
			}

			return true;
		});
	}

	/**
	 * Get all workers with optional filters
	 */
	async getWorkers(filters?: WorkerFilters): Promise<WorkerInfo[]> {
		const wsServer = this.orchestrator.getWsServer();
		if (!wsServer) {
			return [];
		}

		const allWorkers = wsServer.getWorkers();

		if (!filters) {
			return allWorkers;
		}

		// Apply filters
		return allWorkers.filter((worker: WorkerInfo) => {
			// Filter by status (idle/busy based on taskId)
			if (filters.status) {
				const isIdle = worker.taskId === null;
				if (filters.status === 'idle' && !isIdle) {
					return false;
				}
				if (filters.status === 'busy' && isIdle) {
					return false;
				}
			}

			return true;
		});
	}

	/**
	 * Get orchestrator statistics
	 */
	async getStats(): Promise<OrchestratorStats> {
		const taskManager = this.orchestrator.getTaskManager();
		const wsServer = this.orchestrator.getWsServer();
		const startTime = this.orchestrator.getStartTime() || new Date();

		const allTasks = taskManager.getAllTasks();
		const workers = wsServer ? wsServer.getWorkers() : [];

		// Calculate task statistics
		const tasksByStatus: Record<string, number> = {};
		allTasks.forEach((task: Task) => {
			tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
		});

		return {
			restPort: 3737, // TODO: Get from orchestrator config
			wsPort: wsServer ? wsServer.getPort() : 3738,
			version: ORCHESTRATOR_VERSION,
			uptime: Date.now() - startTime.getTime(),
			workers: workers.length,
			workersList: workers,
			tasks: {
				total: allTasks.length,
				byStatus: tasksByStatus,
			},
		};
	}

	/**
	 * Rename a worker (not implemented yet)
	 */
	async renameWorker(_workerId: string, _name: string): Promise<void> {
		// TODO: Implement when worker naming is supported
		throw new Error('renameWorker not yet implemented for library mode');
	}

	// ===========================================================================================
	// O→B EVENT SUBSCRIPTION (Direct EventEmitter integration)
	// ===========================================================================================

	/**
	 * Subscribe to an O→B event
	 * Maps StateManager events to O2B event types
	 */
	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		const taskManager = this.orchestrator.getTaskManager();
		const stateManager = taskManager.getStateManager();

		// Map O2B event types to StateManager events
		switch (event) {
			case 'task.created':
				stateManager.on(StateEvent.TASK_CREATED, (eventData: { task: Task }) => {
					const o2bData: O2BEventData<'task.created'> = {
						taskId: eventData.task.id,
						task: eventData.task,
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});
				break;

			case 'task.updated':
				stateManager.on(StateEvent.TASK_UPDATED, (eventData: { task: Task }) => {
					const o2bData: O2BEventData<'task.updated'> = {
						taskId: eventData.task.id,
						task: eventData.task,
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});
				break;

			case 'task.completed':
				// Listen to TASK_UPDATED and filter for completed status
				stateManager.on(StateEvent.TASK_UPDATED, (eventData: { task: Task }) => {
					if (eventData.task.flowResult?.status === 'completed') {
						const o2bData: O2BEventData<'task.completed'> = {
							taskId: eventData.task.id,
							workerId: eventData.task.assignedTo?.workerId,
							result: eventData.task.flowResult?.outputs,
							timestamp: new Date().toISOString(),
						};
						handler(o2bData as O2BEventData<T>);
					}
				});
				break;

			case 'task.failed':
				// Listen to TASK_UPDATED and filter for failed status
				stateManager.on(StateEvent.TASK_UPDATED, (eventData: { task: Task }) => {
					if (eventData.task.flowResult?.status === 'failed') {
						const o2bData: O2BEventData<'task.failed'> = {
							taskId: eventData.task.id,
							workerId: eventData.task.assignedTo?.workerId,
							error: eventData.task.flowResult.error || 'Unknown error',
							timestamp: new Date().toISOString(),
						};
						handler(o2bData as O2BEventData<T>);
					}
				});
				break;

			case 'task.status_changed':
				stateManager.on(StateEvent.TASK_UPDATED, (eventData: { task: Task }) => {
					// Get previous status from task history
					const history = eventData.task.history;
					if (history.length >= 2) {
						const current = history[history.length - 1];
						const previous = history[history.length - 2];
						if (current.event === 'status_change') {
							const o2bData: O2BEventData<'task.status_changed'> = {
								taskId: eventData.task.id,
								previousStatus: (previous as { status?: string }).status || 'unknown',
								newStatus: eventData.task.status,
								timestamp: new Date().toISOString(),
							};
							handler(o2bData as O2BEventData<T>);
						}
					}
				});
				break;

			case 'worker.connected':
				stateManager.on(StateEvent.WORKER_CONNECTED, (eventData: { worker: WorkerInfo }) => {
					const o2bData: O2BEventData<'worker.connected'> = {
						workerId: eventData.worker.id,
						connectedAt: eventData.worker.connectedAt,
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});
				break;

			case 'worker.disconnected':
				stateManager.on(StateEvent.WORKER_DISCONNECTED, (eventData: { workerId: string }) => {
					const o2bData: O2BEventData<'worker.disconnected'> = {
						workerId: eventData.workerId,
						reason: 'Disconnected',
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});
				break;

			case 'worker.status':
				// Map WORKER_TASK_ASSIGNED and WORKER_TASK_RELEASED to worker.status
				stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, (eventData: { workerId: string; taskId: string }) => {
					const o2bData: O2BEventData<'worker.status'> = {
						workerId: eventData.workerId,
						status: 'busy',
						taskId: eventData.taskId,
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});

				stateManager.on(StateEvent.WORKER_TASK_RELEASED, (eventData: { workerId: string }) => {
					const o2bData: O2BEventData<'worker.status'> = {
						workerId: eventData.workerId,
						status: 'idle',
						taskId: null,
						timestamp: new Date().toISOString(),
					};
					handler(o2bData as O2BEventData<T>);
				});
				break;

			case 'worker.log':
				// Worker logs not yet implemented in StateManager
				// TODO: Implement when worker logging is added
				break;

			default:
				console.warn(`[LibraryAdapter] Unknown event type: ${event}`);
		}
	}

	/**
	 * Unsubscribe from an O→B event
	 */
	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		const taskManager = this.orchestrator.getTaskManager();
		const stateManager = taskManager.getStateManager();

		// Map O2B event types to StateManager events and remove listener
		switch (event) {
			case 'task.created':
				stateManager.off(StateEvent.TASK_CREATED, handler as unknown as (...args: unknown[]) => void);
				break;
			case 'task.updated':
				stateManager.off(StateEvent.TASK_UPDATED, handler as unknown as (...args: unknown[]) => void);
				break;
			case 'worker.connected':
				stateManager.off(StateEvent.WORKER_CONNECTED, handler as unknown as (...args: unknown[]) => void);
				break;
			case 'worker.disconnected':
				stateManager.off(StateEvent.WORKER_DISCONNECTED, handler as unknown as (...args: unknown[]) => void);
				break;
			// Note: For composite events (task.completed, task.failed, worker.status),
			// we'd need to track the wrapped handlers to properly remove them
			// This is a known limitation - consider refactoring if needed
			default:
				console.warn(`[LibraryAdapter] Cannot unsubscribe from event: ${event}`);
		}
	}

	// ===========================================================================================
	// LIFECYCLE MANAGEMENT
	// ===========================================================================================

	/**
	 * Connect to orchestrator (no-op for library mode)
	 */
	async connect(): Promise<void> {
		// No-op: already connected via direct reference
	}

	/**
	 * Disconnect from orchestrator (no-op for library mode)
	 */
	async disconnect(): Promise<void> {
		// No-op: orchestrator lifecycle managed externally
	}

	/**
	 * Get the underlying orchestrator instance (library mode only)
	 * Used for shutdown and cleanup in library mode
	 */
	getOrchestrator(): Orchestrator {
		return this.orchestrator;
	}
}
