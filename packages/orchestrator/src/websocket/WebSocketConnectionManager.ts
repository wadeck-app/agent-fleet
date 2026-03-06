import { createLogger } from 'shared-common/logger';
import { serializeMessage } from 'shared-common/protocol';
import type { StateManager } from 'shared-orch-worker/StateManager';
import { StateEvent } from 'shared-orch-worker/StateManager';
import type { WorkerInfo } from 'shared-orch-worker/domain-types';
import type { O2WMessage } from 'shared-orch-worker/orchestrator-messages';
import { O2WMessageType, createO2WMessage } from 'shared-orch-worker/orchestrator-messages';
import type {
	W2OFlowsUpdatedMessage,
	W2ORequestTaskMessage,
	W2OWorkerReadyMessage,
} from 'shared-orch-worker/worker-messages';
import type { W2OMessage } from 'shared-orch-worker/worker-messages';
import { WebSocket } from 'ws';

import type { WorkerCoordinator } from '../core/WorkerCoordinator';
import type { EventSubscriptionRegistry } from '../registry/EventSubscriptionRegistry';
import { FlowDiscoveryRegistry, FlowVersionMismatchError } from '../registry/FlowDiscoveryRegistry';

const log = createLogger('WebSocketConnectionManager');

interface WorkerConnection extends WorkerInfo {
	socket: WebSocket;
	projectId: string;
	workspacePath: string;
	gitBranch?: string;
}

/**
 * Manages WebSocket connections for workers
 * Responsibilities:
 * - Track worker connections
 * - Assign worker IDs
 * - Handle connection/disconnection lifecycle
 * - Assign tasks to workers (delegated to WorkerCoordinator)
 * - Manage flow discovery registry
 */
export class WebSocketConnectionManager {
	private workers: Map<string, WorkerConnection>;
	private nextWorkerNum: number = 1;
	private workerCoordinator: WorkerCoordinator;
	private stateManager: StateManager;
	private flowDiscoveryRegistry: FlowDiscoveryRegistry;
	private taskAssignedListener: (data: { workerId: string; taskId: string }) => void;

	constructor(
		workerCoordinator: WorkerCoordinator,
		stateManager: StateManager,
		eventSubscriptionRegistry?: EventSubscriptionRegistry
	) {
		this.workers = new Map();
		this.workerCoordinator = workerCoordinator;
		this.stateManager = stateManager;
		this.flowDiscoveryRegistry = new FlowDiscoveryRegistry(eventSubscriptionRegistry);

		// Store listener reference so we can remove it later during cleanup
		this.taskAssignedListener = (data: { workerId: string; taskId: string }) => {
			const worker = this.workers.get(data.workerId);
			if (worker) {
				log.info(`[WebSocketConnectionManager] Updating worker ${data.workerId} taskId to ${data.taskId}`);
				worker.taskId = data.taskId;
				worker.taskStartedAt = new Date().toISOString();
			} else {
				log.warn(`[WebSocketConnectionManager] Cannot update taskId: worker ${data.workerId} not found`);
			}
		};

		// Listen to task assignment events to update worker.taskId and taskStartedAt
		this.stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, this.taskAssignedListener);
	}

	/**
	 * Handle WORKER_READY message and register the worker
	 * Returns the assigned worker ID
	 */
	handleWorkerReady(socket: WebSocket, message: W2OWorkerReadyMessage): string {
		const { preferredId, projectId, workspacePath, availableFlows, gitBranch } = message;

		log.info(`[WS] Worker READY - gitBranch: ${gitBranch || 'undefined'}, workspacePath: ${workspacePath}`);

		let workerId: string;

		// If a preferred ID is provided and not already taken, use it
		if (preferredId && !this.workers.has(preferredId)) {
			workerId = preferredId;
			log.info(`[WS] Using preferred worker ID: ${workerId}`);
		} else {
			// Otherwise, use auto-increment
			workerId = '' + ++this.nextWorkerNum;
			if (preferredId) {
				log.info(`[WS] Preferred ID '${preferredId}' already taken, assigned '${workerId}' instead`);
			}
		}

		// Register worker flows in discovery registry
		try {
			this.flowDiscoveryRegistry.registerWorker(workerId, projectId, workspacePath, availableFlows);
			log.info(`[WS] Registered ${availableFlows.length} flows for worker ${workerId} (project: ${projectId})`);
		} catch (error) {
			if (error instanceof FlowVersionMismatchError) {
				log.error(`[WS] Flow version mismatch for worker ${workerId}: ${error.message}`);
				this.sendMessage(
					socket,
					createO2WMessage(O2WMessageType.ERROR, {
						error: error.message,
					})
				);
				socket.close();
				throw error;
			}
			throw error;
		}

		const worker: WorkerConnection = {
			id: workerId,
			taskId: null,
			taskStartedAt: null,
			connectedAt: new Date().toISOString(),
			socket,
			projectId,
			workspacePath,
			gitBranch,
		};

		this.workers.set(workerId, worker);

		log.info(`[WS] Work  er ${workerId} is ready`);

		this.stateManager.emitWorkerConnected({
			id: workerId,
			taskId: null,
			taskStartedAt: null,
			connectedAt: worker.connectedAt,
		});

		// Send Welcome
		this.sendMessage(socket, createO2WMessage(O2WMessageType.WORKER_WELCOME, { workerId }));

		// Register worker with WorkerCoordinator (convert FlowMetadata[] to string[])
		const flowIds = availableFlows.map(flow => flow.id);
		this.workerCoordinator.registerWorker(workerId, socket, flowIds);

		return workerId;
	}

	/**
	 * Handle worker disconnection
	 */
	handleWorkerDisconnect(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}

		log.info(`[WS] Worker ${workerId} disconnected`);

		// Unregister from WorkerCoordinator (handles task cleanup)
		this.workerCoordinator.unregisterWorker(workerId);

		// Unregister from flow discovery registry
		this.flowDiscoveryRegistry.unregisterWorker(workerId);
		log.info(`[WS] Unregistered worker ${workerId} from flow discovery registry`);

		this.workers.delete(workerId);
		this.stateManager.emitWorkerDisconnected(workerId);
	}

	/**
	 * Try to assign tasks to all idle workers
	 * Note: This is now handled by WorkerCoordinator, but kept for backward compatibility
	 */
	async tryAssignTasksToIdleWorkers(): Promise<void> {
		// WorkerCoordinator now handles task assignment automatically
		// This method is kept for backward compatibility but does nothing
		log.debug('[WS] tryAssignTasksToIdleWorkers called - WorkerCoordinator handles assignment automatically');
	}

	/**
	 * Release a worker from its current task
	 * Note: Task assignment is now handled by WorkerCoordinator
	 */
	releaseWorker(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (worker) {
			worker.taskId = null;
			worker.taskStartedAt = null;
			this.stateManager.emitWorkerTaskReleased(workerId);
			// WorkerCoordinator handles task assignment automatically when worker becomes idle
		}
	}

	/**
	 * Get a worker by ID
	 */
	getWorker(workerId: string): WorkerConnection | undefined {
		return this.workers.get(workerId);
	}

	/**
	 * Get all workers (without  socket references)
	 */
	getWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values()).map(w => ({
			id: w.id,
			// type: w.type,
			taskId: w.taskId,
			taskStartedAt: w.taskStartedAt,
			connectedAt: w.connectedAt,
		}));
	}

	/**
	 * Get workspaces from all connected workers
	 * Returns workspace information (path, projectId, workerId, connectedAt, gitBranch)
	 */
	getConnectedWorkspaces(): Array<{
		workerId: string;
		workspacePath: string;
		projectId: string;
		connectedAt: string;
		gitBranch?: string;
	}> {
		const workspaces: Array<{
			workerId: string;
			workspacePath: string;
			projectId: string;
			connectedAt: string;
			gitBranch?: string;
		}> = [];

		for (const worker of this.workers.values()) {
			workspaces.push({
				workerId: worker.id,
				workspacePath: worker.workspacePath,
				projectId: worker.projectId,
				connectedAt: worker.connectedAt,
				gitBranch: worker.gitBranch,
			});
		}

		return workspaces;
	}

	/**
	 * Send a message to a specific socket
	 */
	sendMessage(socket: WebSocket, message: O2WMessage): void {
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(serializeMessage(message));
		}
	}

	/**
	 * Send an intervention response to the worker handling a specific task
	 */
	sendInterventionResponse(
		taskId: string,
		interventionId: string,
		response: {
			value: any;
			comment?: string;
			answeredAt: string;
			answeredBy: string;
		} | null,
		timedOut?: boolean,
		cancelled?: boolean
	): boolean {
		// Find worker handling this task
		for (const worker of this.workers.values()) {
			if (worker.taskId === taskId) {
				this.sendMessage(
					worker.socket,
					createO2WMessage(O2WMessageType.INTERVENTION_RESPONSE, {
						taskId,
						interventionId,
						response,
						timedOut,
						cancelled,
					})
				);
				log.info(`[WS] Sent INTERVENTION_RESPONSE for task ${taskId} to worker ${worker.id}`);
				return true;
			}
		}

		log.warn(`[WS] No worker found for task ${taskId} to send intervention response`);
		return false;
	}

	/**
	 * Close all worker connections
	 */
	closeAll(): void {
		// Remove event listener to prevent memory leaks
		this.stateManager.removeListener(StateEvent.WORKER_TASK_ASSIGNED, this.taskAssignedListener);

		// Close all worker sockets
		for (const worker of this.workers.values()) {
			worker.socket.close();
		}
		this.workers.clear();
	}

	/**
	 * Get the flow discovery registry
	 */
	getFlowDiscoveryRegistry(): FlowDiscoveryRegistry {
		return this.flowDiscoveryRegistry;
	}

	/**
	 * Handle REQUEST_TASK message from a worker
	 * Delegates to WorkerCoordinator via onWorkerMessage
	 */
	handleRequestTask(socket: WebSocket, message: W2ORequestTaskMessage): void {
		const { workerId } = message;
		const worker = this.workers.get(workerId);

		if (!worker) {
			log.error(`[WS] REQUEST_TASK from unknown worker ${workerId}`);
			return;
		}

		log.info(`[WS] Worker ${workerId} requesting task`);

		// Delegate to WorkerCoordinator which handles task assignment
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle FLOWS_UPDATED message from a worker
	 */
	handleFlowsUpdated(message: W2OFlowsUpdatedMessage): void {
		const { workerId, projectId, flows, changes } = message;

		log.info(`[WS] Worker ${workerId} updating flows (project: ${projectId})`);

		try {
			this.flowDiscoveryRegistry.updateWorkerFlows(workerId, flows);

			if (changes) {
				const changeDesc = [];
				if (changes.added.length > 0) {
					changeDesc.push(`${changes.added.length} added`);
				}
				if (changes.removed.length > 0) {
					changeDesc.push(`${changes.removed.length} removed`);
				}
				if (changes.updated.length > 0) {
					changeDesc.push(`${changes.updated.length} updated`);
				}
				log.info(`[WS] Flow update for worker ${workerId}: ${changeDesc.join(', ')}`);
			}
		} catch (error) {
			if (error instanceof FlowVersionMismatchError) {
				log.error(`[WS] Flow version mismatch for worker ${workerId}: ${error.message}`);
				const worker = this.workers.get(workerId);
				if (worker) {
					this.sendMessage(
						worker.socket,
						createO2WMessage(O2WMessageType.ERROR, {
							error: error.message,
						})
					);
				}
			} else {
				log.error(`[WS] Error updating flows for worker ${workerId}: ${(error as Error).message}`);
			}
		}
	}
}
