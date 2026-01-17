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
	private flowRequestPromises: Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }> =
		new Map();

	constructor(private readonly orchestrator: Orchestrator) {
		if (!orchestrator) {
			throw new Error('OrchestratorWrapper requires an Orchestrator instance');
		}
		this.orchestrator = orchestrator;
		this.setupFlowResponseHandlers();
	}

	/**
	 * Setup handlers for flow definition responses from workers
	 */
	private setupFlowResponseHandlers(): void {
		const wsServer = this.orchestrator.getWsServer();
		if (!wsServer) return;

		const connectionManager = wsServer.getConnectionManager();
		const stateManager = this.orchestrator.getTaskManager().getStateManager();

		// Listen to state events for flow responses
		stateManager.on('worker.message', (data: any) => {
			if (data.type === 'w2o:flow:definition_response') {
				this.handleFlowDefinitionResponse(data);
			} else if (data.type === 'w2o:flow:saved_response') {
				this.handleFlowSavedResponse(data);
			}
		});
	}

	private handleFlowDefinitionResponse(message: any): void {
		const { requestId, flowDefinition, error } = message;
		const pending = this.flowRequestPromises.get(requestId);

		if (pending) {
			this.flowRequestPromises.delete(requestId);
			if (error) {
				pending.reject(new Error(error));
			} else {
				pending.resolve(flowDefinition);
			}
		}
	}

	private handleFlowSavedResponse(message: any): void {
		const { requestId, success, error } = message;
		const pending = this.flowRequestPromises.get(requestId);

		if (pending) {
			this.flowRequestPromises.delete(requestId);
			if (!success && error) {
				pending.reject(new Error(error));
			} else {
				pending.resolve({ success });
			}
		}
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
	 * Get all workspaces from WorkspaceManager
	 */
	async getWorkspaces(): Promise<any[]> {
		const workspaceManager = this.orchestrator.getWorkspaceManager();
		if (!workspaceManager) {
			return [];
		}
		return workspaceManager.getAllWorkspaces();
	}

	/**
	 * Get single workspace by ID
	 */
	async getWorkspace(workspaceId: string): Promise<any | null> {
		const workspaceManager = this.orchestrator.getWorkspaceManager();
		if (!workspaceManager) {
			return null;
		}
		return workspaceManager.getWorkspace(workspaceId) || null;
	}

	/**
	 * Get workspaces from all connected workers
	 */
	async getConnectedWorkersWorkspaces(): Promise<
		Array<{
			workerId: string;
			workspacePath: string;
			projectId: string;
			connectedAt: string;
			gitBranch?: string;
		}>
	> {
		const wsServer = this.orchestrator.getWsServer();
		if (!wsServer) {
			return [];
		}
		return wsServer.getConnectedWorkspaces();
	}

	/**
	 * Rename a worker (not implemented yet)
	 */
	async renameWorker(_workerId: string, _name: string): Promise<void> {
		// TODO: Implement when worker naming is supported
		throw new Error('renameWorker not yet implemented for library mode');
	}

	/**
	 * Get all interventions with optional filters
	 */
	async getInterventions(): Promise<any[]> {
		const interventionManager = this.orchestrator.getInterventionManager();
		if (!interventionManager) {
			console.log('[OrchestratorWrapper] InterventionManager not available');
			return [];
		}
		console.log('[OrchestratorWrapper] Fetching pending interventions from InterventionManager...');
		const interventions = await interventionManager.getPendingInterventions();
		console.log(`[OrchestratorWrapper] Got ${interventions.length} pending interventions`);
		return interventions;
	}

	/**
	 * Get single intervention by ID
	 */
	async getIntervention(interventionId: string): Promise<any | null> {
		const interventionManager = this.orchestrator.getInterventionManager();
		if (!interventionManager) {
			return null;
		}
		return await interventionManager.getIntervention(interventionId);
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
		const interventionManager = this.orchestrator.getInterventionManager();
		if (!interventionManager) {
			throw new Error('InterventionManager not available');
		}
		return await interventionManager.respondToIntervention(interventionId, response);
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

	// ===========================================================================================
	// FLOW DEFINITION METHODS
	// ===========================================================================================

	/**
	 * Request full flow definition from a worker
	 */
	async requestFlowDefinition(projectId: string, flowId: string): Promise<any> {
		const wsServer = this.orchestrator.getWsServer();
		if (!wsServer) {
			throw new Error('WebSocket server not available');
		}

		const connectionManager = wsServer.getConnectionManager();
		const registry = connectionManager.getFlowDiscoveryRegistry();

		// Find workers that have this flow
		const projectFlows = registry.getProjectFlows(projectId);
		if (!projectFlows || !projectFlows.has(flowId)) {
			throw new Error(`Flow ${flowId} not found in project ${projectId}`);
		}

		const flowEntries = projectFlows.get(flowId);
		if (!flowEntries || flowEntries.length === 0) {
			throw new Error(`No workers available for flow ${flowId}`);
		}

		// Take the first available worker
		const workerId = flowEntries[0].workerId;
		const requestId = `flow-req-${Date.now()}-${Math.random().toString(36).substring(7)}`;

		// Create promise for response
		const responsePromise = new Promise<any>((resolve, reject) => {
			this.flowRequestPromises.set(requestId, { resolve, reject });

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.flowRequestPromises.has(requestId)) {
					this.flowRequestPromises.delete(requestId);
					reject(new Error(`Timeout waiting for flow definition response for ${flowId}`));
				}
			}, 10000);
		});

		// Send request to worker
		const worker = connectionManager.getWorker(workerId);
		if (!worker) {
			this.flowRequestPromises.delete(requestId);
			throw new Error(`Worker ${workerId} not found`);
		}

		connectionManager.sendMessage(worker.socket, {
			type: 'o2w:flow:request_definition',
			flowId,
			requestId,
			timestamp: Date.now(),
		} as any);

		return responsePromise;
	}

	/**
	 * Request worker to save flow definition
	 */
	async saveFlowDefinition(projectId: string, flowId: string, flowDefinition: any): Promise<void> {
		const wsServer = this.orchestrator.getWsServer();
		if (!wsServer) {
			throw new Error('WebSocket server not available');
		}

		const connectionManager = wsServer.getConnectionManager();
		const registry = connectionManager.getFlowDiscoveryRegistry();

		// Find workers that have this flow
		const projectFlows = registry.getProjectFlows(projectId);
		if (!projectFlows || !projectFlows.has(flowId)) {
			throw new Error(`Flow ${flowId} not found in project ${projectId}`);
		}

		const flowEntries = projectFlows.get(flowId);
		if (!flowEntries || flowEntries.length === 0) {
			throw new Error(`No workers available for flow ${flowId}`);
		}

		// Take the first available worker
		const workerId = flowEntries[0].workerId;
		const requestId = `flow-save-${Date.now()}-${Math.random().toString(36).substring(7)}`;

		// Create promise for response
		const responsePromise = new Promise<void>((resolve, reject) => {
			this.flowRequestPromises.set(requestId, { resolve, reject });

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.flowRequestPromises.has(requestId)) {
					this.flowRequestPromises.delete(requestId);
					reject(new Error(`Timeout waiting for flow save response for ${flowId}`));
				}
			}, 10000);
		});

		// Send save request to worker
		const worker = connectionManager.getWorker(workerId);
		if (!worker) {
			this.flowRequestPromises.delete(requestId);
			throw new Error(`Worker ${workerId} not found`);
		}

		connectionManager.sendMessage(worker.socket, {
			type: 'o2w:flow:save_definition',
			flowId,
			flowDefinition,
			requestId,
			timestamp: Date.now(),
		} as any);

		return responsePromise;
	}

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
