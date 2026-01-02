import { logger } from 'shared-common/logger';
import { serializeMessage } from 'shared-common/protocol';
import type { StateManager } from 'shared-orch-worker/StateManager';
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

import type { TaskManager } from '../core/TaskManager';
import { FlowDiscoveryRegistry, FlowVersionMismatchError } from '../registry/FlowDiscoveryRegistry';

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
 * - Assign tasks to workers
 * - Manage flow discovery registry
 */
export class WebSocketConnectionManager {
	private workers: Map<string, WorkerConnection>;
	private nextWorkerNum: number = 1;
	private taskManager: TaskManager;
	private stateManager: StateManager;
	private flowDiscoveryRegistry: FlowDiscoveryRegistry;

	constructor(taskManager: TaskManager, stateManager: StateManager) {
		this.workers = new Map();
		this.taskManager = taskManager;
		this.stateManager = stateManager;
		this.flowDiscoveryRegistry = new FlowDiscoveryRegistry();
	}

	/**
	 * Handle WORKER_READY message and register the worker
	 * Returns the assigned worker ID
	 */
	handleWorkerReady(socket: WebSocket, message: W2OWorkerReadyMessage): string {
		const { preferredId, projectId, workspacePath, availableFlows, gitBranch } = message;

		logger.info(`[WS] Worker READY - gitBranch: ${gitBranch || 'undefined'}, workspacePath: ${workspacePath}`);

		let workerId: string;

		// If a preferred ID is provided and not already taken, use it
		if (preferredId && !this.workers.has(preferredId)) {
			workerId = preferredId;
			logger.info(`[WS] Using preferred worker ID: ${workerId}`);
		} else {
			// Otherwise, use auto-increment
			workerId = '' + ++this.nextWorkerNum;
			if (preferredId) {
				logger.info(`[WS] Preferred ID '${preferredId}' already taken, assigned '${workerId}' instead`);
			}
		}

		// Register worker flows in discovery registry
		try {
			this.flowDiscoveryRegistry.registerWorker(workerId, projectId, workspacePath, availableFlows);
			logger.info(
				`[WS] Registered ${availableFlows.length} flows for worker ${workerId} (project: ${projectId})`
			);
		} catch (error) {
			if (error instanceof FlowVersionMismatchError) {
				logger.error(`[WS] Flow version mismatch for worker ${workerId}: ${error.message}`);
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
			// type: workerType,
			taskId: null,
			connectedAt: new Date().toISOString(),
			socket,
			projectId,
			workspacePath,
			gitBranch,
		};

		this.workers.set(workerId, worker);

		// logger.info(`[WS] Worker ${workerId} (${workerType}) is ready`);
		logger.info(`[WS] Worker ${workerId} is ready`);

		this.stateManager.emitWorkerConnected({
			id: workerId,
			// type: workerType,
			taskId: null,
			connectedAt: worker.connectedAt,
		});

		// Send Welcome
		this.sendMessage(socket, createO2WMessage(O2WMessageType.WORKER_WELCOME, { workerId }));

		// Assign a task if available (async, fire and forget)
		// this.tryAssignTask(workerId, workerType).catch(error => {
		this.tryAssignTask(workerId).catch(error => {
			logger.error(`[WS] Error assigning task to worker ${workerId}: ${(error as Error).message}`);
		});

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

		logger.info(`[WS] Worker ${workerId} disconnected`);

		// Release the task if the worker was working on it
		if (worker.taskId) {
			try {
				this.taskManager.unassignTask(worker.taskId);
			} catch (error) {
				logger.error(`[WS] Error unassigning task: ${(error as Error).message}`);
			}
		}

		// Unregister from flow discovery registry
		this.flowDiscoveryRegistry.unregisterWorker(workerId);
		logger.info(`[WS] Unregistered worker ${workerId} from flow discovery registry`);

		this.workers.delete(workerId);
		this.stateManager.emitWorkerDisconnected(workerId);
	}

	/**
	 * Try to assign a task to a specific worker using atomic assignment
	 */
	// async tryAssignTask(workerId: string, workerType: WorkerType): Promise<void> {
	async tryAssignTask(workerId: string): Promise<void> {
		const worker = this.workers.get(workerId);
		if (!worker) {
			logger.error(`[WS] Worker ${workerId} not found`);
			return;
		}

		// Use atomic assignment to prevent race conditions
		// const task = await this.taskManager.assignTaskToWorker(workerId, workerType);
		const task = await this.taskManager.assignTaskToWorker(workerId);
		if (!task) {
			// logger.info(`[WS] No task available for ${workerType} worker ${workerId}`);
			logger.info(`[WS] No task available for worker ${workerId}`);
			return;
		}

		// Update worker state
		worker.taskId = task.id;

		this.stateManager.emitWorkerTaskAssigned(workerId, task.id);

		// Send the task to the worker
		this.sendMessage(
			worker.socket,
			createO2WMessage(O2WMessageType.ASSIGN_TASK, {
				task,
			})
		);

		logger.info(`[WS] Assigned task ${task.id} to worker ${workerId}`);
	}

	/**
	 * Try to assign tasks to all idle workers
	 */
	async tryAssignTasksToIdleWorkers(): Promise<void> {
		// Find all idle workers (not currently working on a task)
		const idleWorkers = Array.from(this.workers.values()).filter(w => w.taskId === null);

		// Try to assign a task to each idle worker (sequentially to avoid race conditions)
		for (const worker of idleWorkers) {
			// await this.tryAssignTask(worker.id, worker.type);
			await this.tryAssignTask(worker.id);
		}
	}

	/**
	 * Release a worker from its current task
	 */
	releaseWorker(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (worker) {
			worker.taskId = null;
			this.stateManager.emitWorkerTaskReleased(workerId);

			// Try to assign a new task (async, fire and forget)
			// this.tryAssignTask(workerId, worker.type).catch(error => {
			this.tryAssignTask(workerId).catch(error => {
				logger.error(`[WS] Error assigning task to released worker ${workerId}: ${(error as Error).message}`);
			});
		}
	}

	/**
	 * Get a worker by ID
	 */
	getWorker(workerId: string): WorkerConnection | undefined {
		return this.workers.get(workerId);
	}

	/**
	 * Get all workers (without socket references)
	 */
	getWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values()).map(w => ({
			id: w.id,
			// type: w.type,
			taskId: w.taskId,
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
				logger.info(`[WS] Sent INTERVENTION_RESPONSE for task ${taskId} to worker ${worker.id}`);
				return true;
			}
		}

		logger.warn(`[WS] No worker found for task ${taskId} to send intervention response`);
		return false;
	}

	/**
	 * Close all worker connections
	 */
	closeAll(): void {
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
	 */
	handleRequestTask(socket: WebSocket, message: W2ORequestTaskMessage): void {
		const { workerId } = message;
		const worker = this.workers.get(workerId);

		if (!worker) {
			logger.error(`[WS] REQUEST_TASK from unknown worker ${workerId}`);
			return;
		}

		logger.info(`[WS] Worker ${workerId} requesting task`);

		// Mark worker as idle
		this.taskManager.markWorkerIdle(workerId);

		// Try to find a matching task
		const task = this.taskManager.findMatchingTask(workerId);

		if (task) {
			// Assign the task to the worker
			this.assignTaskToWorker(workerId, worker, task).catch(error => {
				logger.error(`[WS] Error assigning task to worker ${workerId}: ${(error as Error).message}`);
			});
		} else {
			logger.info(`[WS] No task available for worker ${workerId}, remains idle`);
		}
	}

	/**
	 * Assign a task to a worker (used by REQUEST_TASK handler)
	 */
	private async assignTaskToWorker(workerId: string, worker: WorkerConnection, task: any): Promise<void> {
		// Mark worker as busy
		this.taskManager.markWorkerBusy(workerId, task);

		// Update task assignment
		// await this.taskManager.assignTask(task.id, workerId, worker.type);
		await this.taskManager.assignTask(task.id, workerId);

		// Update worker state
		worker.taskId = task.id;

		this.stateManager.emitWorkerTaskAssigned(workerId, task.id);
		// Send the task to the worker
		this.sendMessage(
			worker.socket,
			createO2WMessage(O2WMessageType.ASSIGN_TASK, {
				task,
			})
		);

		logger.info(`[WS] Assigned task ${task.id} to worker ${workerId}`);
	}

	/**
	 * Handle FLOWS_UPDATED message from a worker
	 */
	handleFlowsUpdated(message: W2OFlowsUpdatedMessage): void {
		const { workerId, projectId, flows, changes } = message;

		logger.info(`[WS] Worker ${workerId} updating flows (project: ${projectId})`);

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
				logger.info(`[WS] Flow update for worker ${workerId}: ${changeDesc.join(', ')}`);
			}
		} catch (error) {
			if (error instanceof FlowVersionMismatchError) {
				logger.error(`[WS] Flow version mismatch for worker ${workerId}: ${error.message}`);
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
				logger.error(`[WS] Error updating flows for worker ${workerId}: ${(error as Error).message}`);
			}
		}
	}
}
