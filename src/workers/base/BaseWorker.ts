import WebSocket from 'ws';
import {
	AssignTaskMessage,
	KillClaudeMessage,
	Message,
	MessageType,
	Task,
	TaskStatus,
	WorkerType,
	WorkerWelcomeMessage
} from '../../shared/types.js';
import {createMessage, parseMessage, serializeMessage} from '../../shared/protocol.js';

export abstract class BaseWorker {
  protected workerId: string;
  protected workerType: WorkerType;
  protected preferredWorkerId?: string;
  protected ws: WebSocket | null = null;
  protected currentTask: Task | null = null;
  protected wsUrl: string;
  protected reconnectDelay = 5000;
  protected heartbeatInterval = 30000;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(workerType: WorkerType, wsUrl: string = 'ws://localhost:3738', preferredWorkerId?: string) {
    // Actual value will be assigned by the orchestrator during Welcome
    this.workerId = '?';
    this.workerType = workerType;
    this.wsUrl = wsUrl;
    this.preferredWorkerId = preferredWorkerId;
  }

  /**
   * Connect to the orchestrator
   */
  async connect(): Promise<void> {
    process.title = 'Worker X';
    
    return new Promise((resolve, reject) => {
      console.log(`${this.logPrefix()} Connecting to ${this.wsUrl}...`);

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        console.log(`${this.logPrefix()} Connected`);
        this.sendWorkerReady();
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = parseMessage(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error(`${this.logPrefix()} Error parsing message:`, (error as Error).message);
        }
      });

      this.ws.on('close', () => {
        console.log(`${this.logPrefix()} Disconnected`);
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error(`${this.logPrefix()} WebSocket error:`, error);
        reject(error);
      });
    });
  }

  /**
   * Send WORKER_READY message
   */
  private sendWorkerReady(): void {
    this.sendMessage(createMessage(MessageType.WORKER_READY, {
      workerType: this.workerType,
      preferredId: this.preferredWorkerId
    }));
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage(createMessage(MessageType.WORKER_HEARTBEAT, {
        workerId: this.workerId
      }));
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    console.log(`${this.logPrefix()} Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => {
      this.connect().catch((error) => {
        console.error(`${this.logPrefix()} Reconnection failed:`, error);
      });
    }, this.reconnectDelay);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: Message): void {
    switch (message.type) {
      case MessageType.ACK:
        // Acknowledgment received
        break;

      case MessageType.WORKER_WELCOME:
        this.handleWelcome(message as WorkerWelcomeMessage);
        break;

      case MessageType.ASSIGN_TASK:
        this.handleAssignTask(message as AssignTaskMessage);
        break;

      case MessageType.KILL_CLAUDE:
        this.handleKillClaude(message as KillClaudeMessage);
        break;

      case MessageType.PAUSE:
        console.log(`${this.logPrefix()} Received PAUSE`);
        // TODO: Implement pause logic
        break;

      case MessageType.RESUME:
        console.log(`${this.logPrefix()} Received RESUME`);
        // TODO: Implement resume logic
        break;

      case MessageType.SHUTDOWN:
        console.log(`${this.logPrefix()} Received SHUTDOWN`);
        this.shutdown();
        break;

      default:
        console.warn(`${this.logPrefix()} Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle task assignment
   */
  private async handleWelcome(message: WorkerWelcomeMessage): Promise<void> {
    this.workerId = message.workerId;
    process.title = `Worker ${this.workerId}`;

    console.log(`${this.logPrefix()} Welcome received with assigned id=${message.workerId}`);

    // Call hook for subclasses
    this.onWelcome(message.workerId);
  }

  /**
   * Hook called when worker receives its ID from orchestrator
   * Override in subclasses if needed
   */
  protected onWelcome(workerId: string): void {
    // Default implementation does nothing
  }

  /**
   * Handle task assignment
   */
  private async handleAssignTask(message: AssignTaskMessage): Promise<void> {
    this.currentTask = message.task;
    console.log(`${this.logPrefix()} Assigned task ${this.currentTask.id}: ${this.currentTask.description}`);

    try {
      await this.executeTask(this.currentTask);
    } catch (error) {
      console.error(`${this.logPrefix()} Task execution error:`, error);
      this.sendTaskFailed((error as Error).message);
    }
  }

  /**
   * Handle kill Claude request
   */
  private handleKillClaude(message: KillClaudeMessage): void {
    console.log(`${this.logPrefix()} Kill Claude requested: ${message.reason}`);
    // TODO: Implement Claude process killing
  }

  /**
   * Execute a task - to be implemented by subclasses
   */
  protected abstract executeTask(task: Task): Promise<void>;

  /**
   * Send task started notification
   */
  protected sendTaskStarted(newStatus?: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_STARTED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      newStatus
    }));
  }

  /**
   * Send task progress update
   */
  protected sendTaskProgress(progress: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_PROGRESS, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      progress
    }));
  }

  /**
   * Send task completed notification
   */
  protected sendTaskCompleted(result?: any, newStatus?: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_COMPLETED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      result,
      newStatus
    }));

    this.currentTask = null;
  }

  /**
   * Send task failed notification
   */
  protected sendTaskFailed(error: string, newStatus?: TaskStatus): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_FAILED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      error,
      newStatus
    }));

    this.currentTask = null;
  }

  /**
   * Send task question
   */
  protected sendTaskQuestion(question: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_QUESTION, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      question
    }));
  }

  /**
   * Send stop requested (from Claude hook)
   */
  protected sendStopRequested(claudePid: number): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.STOP_REQUESTED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      claudePid
    }));
  }

  /**
   * Send hook event
   */
  protected sendHookEvent(hookName: string, data: any): void {
    this.sendMessage(createMessage(MessageType.HOOK_EVENT, {
      workerId: this.workerId,
      hookName,
      data
    }));
  }

  /**
   * Send a message to orchestrator
   */
  protected sendMessage(message: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(message));
    } else {
      console.error(`${this.logPrefix()} Cannot send message, not connected`);
    }
  }

  protected logPrefix() {
    return `[Worker ${this.workerId}] `;
  }
  
  /**
   * Shutdown the worker
   */
  shutdown(): void {
    console.log(`${this.logPrefix()} Shutting down...`);
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    process.exit(0);
  }
}
