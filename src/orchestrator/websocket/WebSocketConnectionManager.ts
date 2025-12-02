import { WebSocket } from 'ws';
import {
  WorkerInfo,
  WorkerType,
  WorkerReadyMessage,
  Message,
  MessageType
} from '../../shared/types.js';
import { createMessage, serializeMessage } from '../../shared/protocol.js';
import { TaskManager } from '../core/TaskManager.js';
import { StateManager } from '../../shared/StateManager.js';
import { Logger } from '../../shared/Logger.js';

interface WorkerConnection extends WorkerInfo {
  socket: WebSocket;
}

/**
 * Manages WebSocket connections for workers
 * Responsibilities:
 * - Track worker connections
 * - Assign worker IDs
 * - Handle connection/disconnection lifecycle
 * - Assign tasks to workers
 */
export class WebSocketConnectionManager {
  private workers: Map<string, WorkerConnection>;
  private nextWorkerNum: number = 1;
  private taskManager: TaskManager;
  private stateManager: StateManager;

  constructor(taskManager: TaskManager, stateManager: StateManager) {
    this.workers = new Map();
    this.taskManager = taskManager;
    this.stateManager = stateManager;
  }

  /**
   * Handle WORKER_READY message and register the worker
   * Returns the assigned worker ID
   */
  handleWorkerReady(socket: WebSocket, message: WorkerReadyMessage): string {
    const { workerType, preferredId } = message;

    let workerId: string;

    // If a preferred ID is provided and not already taken, use it
    if (preferredId && !this.workers.has(preferredId)) {
      workerId = preferredId;
      Logger.log(`[WS] Using preferred worker ID: ${workerId}`);
    } else {
      // Otherwise, use auto-increment
      workerId = '' + ++this.nextWorkerNum;
      if (preferredId) {
        Logger.log(`[WS] Preferred ID '${preferredId}' already taken, assigned '${workerId}' instead`);
      }
    }

    const worker: WorkerConnection = {
      id: workerId,
      type: workerType,
      taskId: null,
      connectedAt: new Date().toISOString(),
      socket
    };

    this.workers.set(workerId, worker);

    Logger.log(`[WS] Worker ${workerId} (${workerType}) is ready`);

    this.stateManager.emitWorkerConnected({
      id: workerId,
      type: workerType,
      taskId: null,
      connectedAt: worker.connectedAt
    });

    // Send Welcome
    this.sendMessage(socket, createMessage(MessageType.WORKER_WELCOME, { workerId }));

    // Assign a task if available
    this.tryAssignTask(workerId, workerType);

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

    Logger.log(`[WS] Worker ${workerId} disconnected`);

    // Release the task if the worker was working on it
    if (worker.taskId) {
      try {
        this.taskManager.unassignTask(worker.taskId);
      } catch (error) {
        Logger.error(`[WS] Error unassigning task: ${(error as Error).message}`);
      }
    }

    this.workers.delete(workerId);
    this.stateManager.emitWorkerDisconnected(workerId);
  }

  /**
   * Try to assign a task to a specific worker
   */
  tryAssignTask(workerId: string, workerType: WorkerType): void {
    const task = this.taskManager.getNextTaskForWorker(workerType);
    if (!task) {
      Logger.log(`[WS] No task available for ${workerType} worker ${workerId}`);
      return;
    }

    const worker = this.workers.get(workerId);
    if (!worker) {
      Logger.error(`[WS] Worker ${workerId} not found`);
      return;
    }

    // Assign the task
    this.taskManager.assignTask(task.id, workerId, workerType);
    worker.taskId = task.id;

    this.stateManager.emitWorkerTaskAssigned(workerId, task.id);

    // Send the task to the worker
    this.sendMessage(worker.socket, createMessage(MessageType.ASSIGN_TASK, {
      task
    }));

    Logger.log(`[WS] Assigned task ${task.id} to worker ${workerId}`);
  }

  /**
   * Try to assign tasks to all idle workers
   */
  tryAssignTasksToIdleWorkers(): void {
    // Find all idle workers (not currently working on a task)
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.taskId === null);

    // Try to assign a task to each idle worker
    for (const worker of idleWorkers) {
      this.tryAssignTask(worker.id, worker.type);
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

      // Try to assign a new task
      this.tryAssignTask(workerId, worker.type);
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
      type: w.type,
      taskId: w.taskId,
      connectedAt: w.connectedAt
    }));
  }

  /**
   * Send a message to a specific socket
   */
  sendMessage(socket: WebSocket, message: Message): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeMessage(message));
    }
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
}
