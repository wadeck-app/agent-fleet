import { logger } from 'shared-common/logger';
import type { StateManager } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { O2WMessageType, createO2WMessage } from 'shared-orch-worker/orchestrator-messages';
import type { W2OMessage } from 'shared-orch-worker/worker-messages';
import { W2OMessageType } from 'shared-orch-worker/worker-messages';
import type { WebSocket } from 'ws';

import type { BackendEventBridge } from './BackendEventBridge';

/**
 * Worker connection information stored in memory
 */
interface WorkerConnection {
	workerId: string;
	socket: WebSocket;
	connectedAt: string;
	availableFlows: string[];
}

/**
 * WorkerCoordinator - Lightweight, in-memory worker coordination system
 *
 * This class manages worker connections, task queues, and task assignment.
 * It operates entirely in memory with NO persistence.
 *
 * Key responsibilities:
 * - Track connected workers and their capabilities
 * - Maintain task queues (global backlog and per-worker queues)
 * - Assign tasks to idle workers based on availability
 * - Route worker messages to backend via BackendEventBridge
 *
 * Important: All state is in-memory. When orchestrator restarts,
 * the backend is responsible for re-enqueuing tasks.
 */
export class WorkerCoordinator {
	// In-memory state (NO PERSISTENCE)
	private workers: Map<string, WorkerConnection> = new Map();
	private globalBacklog: Task[] = [];
	private workerQueues: Map<string, Task[]> = new Map();
	private idleWorkers: Set<string> = new Set();

	constructor(
		private eventBridge: BackendEventBridge,
		private stateManager: StateManager
	) {}

	/**
	 * Called by backend when task becomes assignable
	 *
	 * Routes task to appropriate queue:
	 * - If task has assignedWorker, adds to worker-specific queue
	 * - Otherwise, adds to global backlog
	 *
	 * After enqueuing, attempts to assign tasks to idle workers
	 */
	enqueueTask(task: Task): void {
		if (task.assignedTo?.workerId) {
			// Specific worker assignment
			const workerId = task.assignedTo.workerId;
			let queue = this.workerQueues.get(workerId);
			if (!queue) {
				queue = [];
				this.workerQueues.set(workerId, queue);
			}
			queue.push(task);
			logger.info(`[WorkerCoordinator] Task ${task.id} enqueued for worker ${workerId}`);
		} else {
			// Global backlog
			this.globalBacklog.push(task);
			logger.info(`[WorkerCoordinator] Task ${task.id} enqueued to global backlog`);
		}

		this.tryAssignTasks();
	}

	/**
	 * Try to assign tasks to idle workers
	 *
	 * Iterates through all idle workers and attempts to find
	 * a matching task for each one
	 */
	private tryAssignTasks(): void {
		// Create array from Set to avoid modification during iteration
		const idleWorkerIds = Array.from(this.idleWorkers);

		for (const workerId of idleWorkerIds) {
			const task = this.getNextTaskForWorker(workerId);
			if (task) {
				this.assignTaskToWorker(task, workerId);
			}
		}
	}

	/**
	 * Get next available task for a worker
	 *
	 * Priority order:
	 * 1. Worker's personal queue (pre-assigned tasks)
	 * 2. Global backlog (FIFO)
	 *
	 * @param workerId - Worker requesting a task
	 * @returns Task or null if no matching task found
	 */
	private getNextTaskForWorker(workerId: string): Task | null {
		// Check worker's personal queue first
		const workerQueue = this.workerQueues.get(workerId);
		if (workerQueue && workerQueue.length > 0) {
			const task = workerQueue.shift()!;
			logger.info(`[WorkerCoordinator] Found task ${task.id} in worker ${workerId} queue`);
			return task;
		}

		// Check global backlog
		if (this.globalBacklog.length > 0) {
			const task = this.globalBacklog.shift()!;
			logger.info(`[WorkerCoordinator] Found task ${task.id} in global backlog for worker ${workerId}`);
			return task;
		}

		return null;
	}

	/**
	 * Assign task to worker and notify backend
	 *
	 * Sends ASSIGN_TASK message to worker via WebSocket
	 * Marks worker as busy (removes from idle set)
	 * Notifies backend via BackendEventBridge
	 */
	private assignTaskToWorker(task: Task, workerId: string): void {
		const worker = this.workers.get(workerId);
		if (!worker) {
			logger.error(`[WorkerCoordinator] Cannot assign task ${task.id}: worker ${workerId} not found`);
			// Re-enqueue task
			this.globalBacklog.unshift(task);
			return;
		}

		// Send O2W_ASSIGN_TASK message via socket
		const message = createO2WMessage(O2WMessageType.ASSIGN_TASK, {
			task,
		});

		try {
			worker.socket.send(JSON.stringify(message));
			logger.info(`[WorkerCoordinator] Assigned task ${task.id} to worker ${workerId}`);

			// Mark worker as busy
			this.idleWorkers.delete(workerId);

			// Emit state event (triggers WebSocketConnectionManager update + B2F_WORKERS_UPDATED)
			this.stateManager.emitWorkerTaskAssigned(workerId, task.id);

			// Notify backend via BackendEventBridge
			void this.eventBridge.sendToBackend('task_assigned', {
				taskId: task.id,
				workerId,
			});
		} catch (error) {
			logger.error(
				`[WorkerCoordinator] Failed to send task ${task.id} to worker ${workerId}: ${error instanceof Error ? error.message : String(error)}`
			);
			// Re-enqueue task
			this.globalBacklog.unshift(task);
		}
	}

	/**
	 * Handle worker messages
	 *
	 * Routes worker messages to backend and manages worker state
	 * based on message type
	 */
	onWorkerMessage(workerId: string, message: W2OMessage): void {
		switch (message.type) {
			case W2OMessageType.TASK_STARTED:
				void this.eventBridge.sendToBackend('task_started', {
					taskId: message.taskId,
				});
				break;

			case W2OMessageType.TASK_TRACE_UPDATE:
				console.log(
					`[WorkerCoordinator] [TRACE] Received TASK_TRACE_UPDATE from worker ${workerId} - task=${message.taskId}, steps=${message.trace?.steps?.length || 0}`
				);

				// Send trace to backend for storage
				void this.eventBridge.sendToBackend('task_trace_update', {
					taskId: message.taskId,
					traceChunk: message.trace,
				});

				// Emit state event for real-time frontend updates
				this.stateManager.emitTaskTraceUpdated(message.taskId, message.trace?.steps?.length || 0);
				break;

			case W2OMessageType.INTERVENTION_REQUESTED:
				void this.eventBridge.sendToBackend('intervention_requested', {
					taskId: message.taskId,
					interventionData: {
						interventionId: message.interventionId,
						flowId: message.flowId,
						stepId: message.stepId,
						interventionType: message.interventionType,
						blocking: message.blocking,
						config: message.config,
						timeout: message.timeout,
					},
				});
				break;

			case W2OMessageType.TASK_COMPLETED:
				// Mark worker as idle and try to assign more tasks
				this.idleWorkers.add(workerId);

				void this.eventBridge.sendToBackend('task_completed', {
					taskId: message.taskId,
					flowResult: message.result,
				});

				// Try to assign next task to this now-idle worker
				this.tryAssignTasks();
				break;

			case W2OMessageType.TASK_FAILED:
				// Mark worker as idle and try to assign more tasks
				this.idleWorkers.add(workerId);

				void this.eventBridge.sendToBackend('task_completed', {
					taskId: message.taskId,
					flowResult: {
						status: 'failed',
						error: message.error,
					},
				});

				// Try to assign next task to this now-idle worker
				this.tryAssignTasks();
				break;

			case W2OMessageType.REQUEST_TASK:
				// Worker explicitly requesting a task
				const task = this.getNextTaskForWorker(workerId);
				if (task) {
					this.assignTaskToWorker(task, workerId);
				} else {
					// No task available, mark as idle
					this.idleWorkers.add(workerId);
					logger.info(`[WorkerCoordinator] No tasks available for worker ${workerId}, marked as idle`);
				}
				break;

			default:
				// Pass through other message types without specific handling
				logger.debug(`[WorkerCoordinator] Received unhandled message type: ${message.type}`);
				break;
		}
	}

	/**
	 * Worker connected
	 *
	 * Registers worker connection, marks as idle, and notifies backend
	 * Attempts to assign tasks to the new worker
	 */
	registerWorker(workerId: string, socket: WebSocket, availableFlows: string[]): void {
		this.workers.set(workerId, {
			workerId,
			socket,
			connectedAt: new Date().toISOString(),
			availableFlows,
		});

		this.idleWorkers.add(workerId);

		logger.info(`[WorkerCoordinator] Worker ${workerId} registered with ${availableFlows.length} flows`);

		void this.eventBridge.sendToBackend('worker_connected', {
			workerId,
			connectedAt: new Date().toISOString(),
			capabilities: availableFlows,
		});

		// Try to assign tasks to the newly connected worker
		this.tryAssignTasks();
	}

	/**
	 * Worker disconnected
	 *
	 * Removes worker from all tracking structures and notifies backend
	 * Tasks in worker's queue are NOT re-enqueued (backend responsibility)
	 */
	unregisterWorker(workerId: string): void {
		this.workers.delete(workerId);
		this.idleWorkers.delete(workerId);

		// Remove worker's queue (tasks are lost - backend should re-enqueue)
		const queue = this.workerQueues.get(workerId);
		if (queue && queue.length > 0) {
			logger.info(
				`[WorkerCoordinator] Worker ${workerId} disconnected with ${queue.length} tasks in queue (discarded)`
			);
		}
		this.workerQueues.delete(workerId);

		logger.info(`[WorkerCoordinator] Worker ${workerId} unregistered`);

		void this.eventBridge.sendToBackend('worker_disconnected', {
			workerId,
		});
	}

	/**
	 * Get all connected workers
	 *
	 * @returns Array of worker information
	 */
	getConnectedWorkers(): Array<{
		workerId: string;
		connectedAt: string;
		availableFlows: string[];
		isIdle: boolean;
	}> {
		return Array.from(this.workers.values()).map(worker => ({
			workerId: worker.workerId,
			connectedAt: worker.connectedAt,
			availableFlows: worker.availableFlows,
			isIdle: this.idleWorkers.has(worker.workerId),
		}));
	}

	/**
	 * Get worker by ID
	 *
	 * @param workerId - Worker ID
	 * @returns Worker connection or undefined if not found
	 */
	getWorker(workerId: string): WorkerConnection | undefined {
		return this.workers.get(workerId);
	}

	/**
	 * Get queue statistics for monitoring/debugging
	 *
	 * @returns Queue statistics
	 */
	getQueueStats(): {
		globalBacklog: number;
		workerQueues: Record<string, number>;
		idleWorkers: number;
		connectedWorkers: number;
	} {
		const workerQueues: Record<string, number> = {};
		for (const [workerId, queue] of this.workerQueues.entries()) {
			workerQueues[workerId] = queue.length;
		}

		return {
			globalBacklog: this.globalBacklog.length,
			workerQueues,
			idleWorkers: this.idleWorkers.size,
			connectedWorkers: this.workers.size,
		};
	}
}
