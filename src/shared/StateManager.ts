import { EventEmitter } from 'events';
import { Task, WorkerInfo } from './types.js';

export enum StateEvent {
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  WORKER_CONNECTED = 'worker_connected',
  WORKER_DISCONNECTED = 'worker_disconnected',
  WORKER_TASK_ASSIGNED = 'worker_task_assigned',
  WORKER_TASK_RELEASED = 'worker_task_released',
  LOG_MESSAGE = 'log_message'
}

export interface TaskEventData {
  task: Task;
}

export interface WorkerEventData {
  worker: WorkerInfo;
  taskId?: string;
}

/**
 * Centralized state manager using EventEmitter
 * Allows different parts of the system to emit and listen to state changes
 */
export class StateManager extends EventEmitter {
  private static instance: StateManager;

  private constructor() {
    super();
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // Task events
  emitTaskCreated(task: Task): void {
    this.emit(StateEvent.TASK_CREATED, { task });
  }

  emitTaskUpdated(task: Task): void {
    this.emit(StateEvent.TASK_UPDATED, { task });
  }

  emitTaskDeleted(taskId: string): void {
    this.emit(StateEvent.TASK_DELETED, { taskId });
  }

  // Worker events
  emitWorkerConnected(worker: WorkerInfo): void {
    this.emit(StateEvent.WORKER_CONNECTED, { worker });
  }

  emitWorkerDisconnected(workerId: string): void {
    this.emit(StateEvent.WORKER_DISCONNECTED, { workerId });
  }

  emitWorkerTaskAssigned(workerId: string, taskId: string): void {
    this.emit(StateEvent.WORKER_TASK_ASSIGNED, { workerId, taskId });
  }

  emitWorkerTaskReleased(workerId: string): void {
    this.emit(StateEvent.WORKER_TASK_RELEASED, { workerId });
  }

  // Log events
  emitLogMessage(message: string): void {
    this.emit(StateEvent.LOG_MESSAGE, { message });
  }
}
