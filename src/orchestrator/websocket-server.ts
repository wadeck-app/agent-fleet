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

interface WorkerConnection extends WorkerInfo {
  socket: WebSocket;
}

export class WorkerWebSocketServer {
  private wss: WebSocketServer;
  private workers: Map<string, WorkerConnection>;
  private taskManager: TaskManager;
  private port: number;

  constructor(taskManager: TaskManager, port: number = 3738) {
    this.taskManager = taskManager;
    this.port = port;
    this.workers = new Map();
    this.wss = new WebSocketServer({ port: this.port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      console.log('[WS] New worker connection');
      this.handleConnection(socket);
    });

    this.wss.on('error', (error) => {
      console.error('[WS] Server error:', error);
    });

    console.log(`[WS] WebSocket server listening on port ${this.port}`);
  }

  private handleConnection(socket: WebSocket): void {
    let workerId: string | null = null;

    socket.on('message', (data: Buffer) => {
      try {
        const message = parseMessage(data.toString());

        // Si c'est un WORKER_READY, enregistrer le worker
        if (message.type === MessageType.WORKER_READY) {
          workerId = (message as WorkerReadyMessage).workerId;
        }

        this.handleMessage(socket, message, workerId);
      } catch (error) {
        console.error('[WS] Error parsing message:', (error as Error).message);
        this.sendMessage(socket, createMessage(MessageType.ERROR, {
          error: (error as Error).message
        }));
      }
    });

    socket.on('close', () => {
      if (workerId) {
        console.log(`[WS] Worker ${workerId} disconnected`);
        const worker = this.workers.get(workerId);

        // Libérer la tâche si le worker était en train de travailler
        if (worker?.taskId) {
          try {
            this.taskManager.unassignTask(worker.taskId);
          } catch (error) {
            console.error(`[WS] Error unassigning task: ${(error as Error).message}`);
          }
        }

        this.workers.delete(workerId);
      }
    });

    socket.on('error', (error) => {
      console.error('[WS] Socket error:', error);
    });
  }

  private handleMessage(socket: WebSocket, message: Message, workerId: string | null): void {
    console.log(`[WS] Received ${message.type} from ${workerId || 'unknown'}`);

    switch (message.type) {
      case MessageType.WORKER_READY:
        this.handleWorkerReady(socket, message as WorkerReadyMessage);
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

  private handleWorkerReady(socket: WebSocket, message: WorkerReadyMessage): void {
    const { workerId, workerType } = message;

    const worker: WorkerConnection = {
      id: workerId,
      type: workerType,
      taskId: null,
      connectedAt: new Date().toISOString(),
      socket
    };

    this.workers.set(workerId, worker);
    console.log(`[WS] Worker ${workerId} (${workerType}) is ready`);

    // Envoyer ACK
    this.sendMessage(socket, createMessage(MessageType.ACK, { workerId }));

    // Assigner une tâche si disponible
    this.tryAssignTask(workerId, workerType);
  }

  private tryAssignTask(workerId: string, workerType: WorkerType): void {
    const task = this.taskManager.getNextTaskForWorker(workerType);
    if (!task) {
      console.log(`[WS] No task available for ${workerType} worker ${workerId}`);
      return;
    }

    const worker = this.workers.get(workerId);
    if (!worker) {
      console.error(`[WS] Worker ${workerId} not found`);
      return;
    }

    // Assigner la tâche
    this.taskManager.assignTask(task.id, workerId, workerType);
    worker.taskId = task.id;

    // Envoyer la tâche au worker
    this.sendMessage(worker.socket, createMessage(MessageType.ASSIGN_TASK, {
      task
    }));

    console.log(`[WS] Assigned task ${task.id} to worker ${workerId}`);
  }

  private handleTaskStarted(message: TaskStartedMessage): void {
    const { workerId, taskId, newStatus } = message;
    console.log(`[WS] Worker ${workerId} started task ${taskId}`);

    const status = newStatus || TaskStatus.IN_PROGRESS;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'started',
      workerId
    });
  }

  private handleTaskProgress(message: TaskProgressMessage): void {
    const { workerId, taskId, progress } = message;
    console.log(`[WS] Worker ${workerId} progress on task ${taskId}: ${progress}`);

    this.taskManager.addComment(taskId, `worker-${workerId}`, progress);
  }

  private handleTaskCompleted(message: TaskCompletedMessage): void {
    const { workerId, taskId, result, newStatus } = message;
    console.log(`[WS] Worker ${workerId} completed task ${taskId}`);

    const status = newStatus || TaskStatus.REVIEW;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'completed',
      workerId,
      result
    });

    // Libérer le worker
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.taskId = null;
      // Essayer d'assigner une nouvelle tâche
      this.tryAssignTask(workerId, worker.type);
    }
  }

  private handleTaskFailed(message: TaskFailedMessage): void {
    const { workerId, taskId, error } = message;
    console.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

    this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
      event: 'failed',
      workerId,
      error
    });

    this.taskManager.addComment(taskId, 'system', `Task failed: ${error}`);

    // Libérer le worker
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.taskId = null;
    }
  }

  private handleTaskQuestion(message: TaskQuestionMessage): void {
    const { workerId, taskId, question } = message;
    console.log(`[WS] Worker ${workerId} has a question on task ${taskId}`);

    this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
      event: 'question_raised',
      workerId,
      question
    });

    this.taskManager.addComment(taskId, `worker-${workerId}`, `Question: ${question}`);
  }

  private handleStopRequested(message: StopRequestedMessage): void {
    const { workerId, taskId } = message;
    console.log(`[WS] Stop requested from worker ${workerId}, task ${taskId}`);

    const worker = this.workers.get(workerId);
    if (worker) {
      this.sendMessage(worker.socket, createMessage(MessageType.KILL_CLAUDE, {
        reason: 'stop_requested'
      }));
    }
  }

  private handleHookEvent(message: HookEventMessage): void {
    const { workerId, hookName, data } = message;
    console.log(`[WS] Hook event ${hookName} from worker ${workerId}`);

    // TODO: Logger dans la base de connaissance si pertinent
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
        console.log('[WS] WebSocket server stopped');
        resolve();
      });
    });
  }
}
