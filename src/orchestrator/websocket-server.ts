import { WebSocketServer, WebSocket } from 'ws';
import {
  Message,
  MessageType,
  WorkerType,
  WorkerInfo,
  WorkerReadyMessage,
  TaskStartedMessage,
  TaskProgressMessage,
  TaskCompletedMessage,
  TaskFailedMessage,
  TaskQuestionMessage,
  StopRequestedMessage,
  HookEventMessage,
  TaskStatus
} from '../shared/types.js';
import { createMessage, parseMessage, serializeMessage } from '../shared/protocol.js';
import { TaskManager } from './task-manager.js';
import { StateManager } from '../shared/state-manager.js';
import { Logger } from '../shared/logger.js';

interface WorkerConnection extends WorkerInfo {
  socket: WebSocket;
}

export class WorkerWebSocketServer {
  private wss: WebSocketServer;
  private workers: Map<string, WorkerConnection>;
  private nextWorkerNum: number = 1;
  private taskManager: TaskManager;
  private stateManager: StateManager;
  private port: number;

  constructor(taskManager: TaskManager, port: number = 3738) {
    this.taskManager = taskManager;
    this.stateManager = StateManager.getInstance();
    this.port = port;
    this.workers = new Map();
    this.wss = new WebSocketServer({ port: this.port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      Logger.log('[WS] New worker connection');
      this.handleConnection(socket);
    });

    this.wss.on('error', (error) => {
      Logger.error('[WS] Server error:', error);
    });

    Logger.log(`[WS] WebSocket server listening on port ${this.port}`);
  }

  private handleConnection(socket: WebSocket): void {
    let workerId: string | null = null;

    socket.on('message', (data: Buffer) => {
      try {
        const message = parseMessage(data.toString());

        const result = this.handleMessage(socket, message, workerId);
        // If handleMessage returns a workerId, update it
        if (result && typeof result === 'string') {
          workerId = result;
        }
      } catch (error) {
        Logger.error('[WS] Error parsing message:', (error as Error).message);
        this.sendMessage(socket, createMessage(MessageType.ERROR, {
          error: (error as Error).message
        }));
      }
    });

    socket.on('close', () => {
      if (workerId) {
        Logger.log(`[WS] Worker ${workerId} disconnected`);
        const worker = this.workers.get(workerId);

        // Release the task if the worker was working on it
        if (worker?.taskId) {
          try {
            this.taskManager.unassignTask(worker.taskId);
          } catch (error) {
            Logger.error(`[WS] Error unassigning task: ${(error as Error).message}`);
          }
        }

        this.workers.delete(workerId);

        this.stateManager.emitWorkerDisconnected(workerId);
      }
    });

    socket.on('error', (error) => {
      Logger.error('[WS] Socket error:', error);
    });
  }

  private handleMessage(socket: WebSocket, message: Message, workerId: string | null): string | void {
    Logger.log(`[WS] Received ${message.type} from ${workerId || 'unknown'}`);

    switch (message.type) {
      case MessageType.WORKER_READY:
        return this.handleWorkerReady(socket, message as WorkerReadyMessage);
        break;

      case MessageType.WORKER_HEARTBEAT:
        this.sendMessage(socket, createMessage(MessageType.ACK, {}));
        break;

      case MessageType.TASK_STARTED:
        this.handleTaskStarted(message as TaskStartedMessage);
        break;

      case MessageType.TASK_PROGRESS:
        this.handleTaskProgress(message as TaskProgressMessage);
        break;

      case MessageType.TASK_COMPLETED:
        this.handleTaskCompleted(message as TaskCompletedMessage);
        break;

      case MessageType.TASK_FAILED:
        this.handleTaskFailed(message as TaskFailedMessage);
        break;

      case MessageType.TASK_QUESTION:
        this.handleTaskQuestion(message as TaskQuestionMessage);
        break;

      case MessageType.STOP_REQUESTED:
        this.handleStopRequested(message as StopRequestedMessage);
        break;

      case MessageType.HOOK_EVENT:
        this.handleHookEvent(message as HookEventMessage);
        break;

      default:
        console.warn(`[WS] Unknown message type: ${message.type}`);
    }
  }

  private handleWorkerReady(socket: WebSocket, message: WorkerReadyMessage): string {
    const { workerType } = message;

    const workerId = '' + ++this.nextWorkerNum;

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

  private tryAssignTask(workerId: string, workerType: WorkerType): void {
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

  private handleTaskStarted(message: TaskStartedMessage): void {
    const { workerId, taskId, newStatus } = message;
    Logger.log(`[WS] Worker ${workerId} started task ${taskId}`);

    const status = newStatus || TaskStatus.IN_PROGRESS;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'started',
      workerId
    });
  }

  private handleTaskProgress(message: TaskProgressMessage): void {
    const { workerId, taskId, progress } = message;
    Logger.log(`[WS] Worker ${workerId} progress on task ${taskId}: ${progress}`);

    this.taskManager.addComment(taskId, `worker-${workerId}`, progress);
  }

  private handleTaskCompleted(message: TaskCompletedMessage): void {
    const { workerId, taskId, result, newStatus } = message;
    Logger.log(`[WS] Worker ${workerId} completed task ${taskId}`);

    const status = newStatus || TaskStatus.REVIEW;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'completed',
      workerId,
      result
    });

    // Release the worker
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.taskId = null;

      this.stateManager.emitWorkerTaskReleased(workerId);

      // Try to assign a new task
      this.tryAssignTask(workerId, worker.type);
    }
  }

  private handleTaskFailed(message: TaskFailedMessage): void {
    const { workerId, taskId, error } = message;
    Logger.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

    this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
      event: 'failed',
      workerId,
      error
    });

    this.taskManager.addComment(taskId, 'system', `Task failed: ${error}`);

    // Release the worker
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.taskId = null;

      this.stateManager.emitWorkerTaskReleased(workerId);
    }
  }

  private handleTaskQuestion(message: TaskQuestionMessage): void {
    const { workerId, taskId, question } = message;
    Logger.log(`[WS] Worker ${workerId} has a question on task ${taskId}`);

    this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
      event: 'question_raised',
      workerId,
      question
    });

    this.taskManager.addComment(taskId, `worker-${workerId}`, `Question: ${question}`);
  }

  private handleStopRequested(message: StopRequestedMessage): void {
    const { workerId, taskId } = message;
    Logger.log(`[WS] Stop requested from worker ${workerId}, task ${taskId}`);

    const worker = this.workers.get(workerId);
    if (worker) {
      this.sendMessage(worker.socket, createMessage(MessageType.KILL_CLAUDE, {
        reason: 'stop_requested'
      }));
    }
  }

  private handleHookEvent(message: HookEventMessage): void {
    const { workerId, hookName, data } = message;
    Logger.log(`[WS] Hook event ${hookName} from worker ${workerId}`);

    // TODO: Log to knowledge base if relevant
  }

  private sendMessage(socket: WebSocket, message: Message): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeMessage(message));
    }
  }

  getWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values()).map(w => ({
      id: w.id,
      type: w.type,
      taskId: w.taskId,
      connectedAt: w.connectedAt
    }));
  }

  /**
   * Try to assign tasks to idle workers
   */
  tryAssignTasksToIdleWorkers(): void {
    // Find all idle workers (not currently working on a task)
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.taskId === null);

    // Try to assign a task to each idle worker
    for (const worker of idleWorkers) {
      this.tryAssignTask(worker.id, worker.type);
    }
  }

  getPort(): number {
    return this.port;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Fermer toutes les connexions
      for (const worker of this.workers.values()) {
        worker.socket.close();
      }
      this.workers.clear();

      this.wss.close(() => {
        Logger.log('[WS] WebSocket server stopped');
        resolve();
      });
    });
  }
}
