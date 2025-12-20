import {
  TaskStartedMessage,
  TaskProgressMessage,
  TaskCompletedMessage,
  TaskFailedMessage,
  TaskQuestionMessage,
  FlowStepStartedMessage,
  FlowStepCompletedMessage,
  FlowStepFailedMessage,
  WorkspaceAllocatedMessage,
  WorkspaceReleasedMessage,
  StopRequestedMessage,
  HookEventMessage,
  TaskStatus,
  Message,
  MessageType
} from 'shared-common/types.js';
import { createMessage } from 'shared-common/protocol.js';
import { TaskManager } from '../core/TaskManager.js';
import { StateManager } from 'shared-common/StateManager.js';
import { Logger } from 'shared-common/Logger.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';

/**
 * Handles all task-related and flow-related events from workers
 * Responsibilities:
 * - Process task lifecycle events (started, progress, completed, failed)
 * - Handle flow step events
 * - Handle workspace events
 * - Update task manager and state manager
 */
export class WebSocketEventHandler {
  private taskManager: TaskManager;
  private stateManager: StateManager;
  private connectionManager: WebSocketConnectionManager;

  constructor(
    taskManager: TaskManager,
    stateManager: StateManager,
    connectionManager: WebSocketConnectionManager
  ) {
    this.taskManager = taskManager;
    this.stateManager = stateManager;
    this.connectionManager = connectionManager;
  }

  /**
   * Handle TASK_STARTED message
   */
  handleTaskStarted(message: TaskStartedMessage): void {
    const { workerId, taskId, newStatus } = message;
    Logger.log(`[WS] Worker ${workerId} started task ${taskId}`);

    const status = newStatus || TaskStatus.IN_PROGRESS;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'started',
      workerId
    });
  }

  /**
   * Handle TASK_PROGRESS message
   */
  handleTaskProgress(message: TaskProgressMessage): void {
    const { workerId, taskId, progress } = message;
    Logger.log(`[WS] Worker ${workerId} progress on task ${taskId}: ${progress}`);

    this.taskManager.addComment(taskId, `worker-${workerId}`, progress);
  }

  /**
   * Handle TASK_COMPLETED message
   */
  handleTaskCompleted(message: TaskCompletedMessage): void {
    const { workerId, taskId, result, newStatus } = message;
    Logger.log(`[WS] Worker ${workerId} completed task ${taskId}`);

    const status = newStatus || TaskStatus.REVIEW;
    this.taskManager.updateTaskStatus(taskId, status, {
      event: 'completed',
      workerId,
      result
    });

    // Release the worker
    this.connectionManager.releaseWorker(workerId);
  }

  /**
   * Handle TASK_FAILED message
   */
  handleTaskFailed(message: TaskFailedMessage): void {
    const { workerId, taskId, error, newStatus } = message;
    Logger.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

    // Use the provided status or default to BLOCKED
    const failureStatus = newStatus || TaskStatus.BLOCKED;

    this.taskManager.updateTaskStatus(taskId, failureStatus, {
      event: 'failed',
      workerId,
      error
    });

    this.taskManager.addComment(taskId, 'system', `Task failed: ${error}`);

    // Release the worker
    const worker = this.connectionManager.getWorker(workerId);
    if (worker) {
      worker.taskId = null;
      this.stateManager.emitWorkerTaskReleased(workerId);
    }
  }

  /**
   * Handle TASK_QUESTION message
   */
  handleTaskQuestion(message: TaskQuestionMessage): void {
    const { workerId, taskId, question } = message;
    Logger.log(`[WS] Worker ${workerId} has a question on task ${taskId}`);

    this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
      event: 'question_raised',
      workerId,
      question
    });

    this.taskManager.addComment(taskId, `worker-${workerId}`, `Question: ${question}`);
  }

  /**
   * Handle FLOW_STEP_STARTED message
   */
  handleFlowStepStarted(message: FlowStepStartedMessage): void {
    const { workerId, taskId, stepId, stepName } = message;
    Logger.log(`[WS] Worker ${workerId} started flow step ${stepId} (${stepName}) for task ${taskId}`);

    this.taskManager.addComment(taskId, 'system', `Flow step started: ${stepName || stepId}`);

    const task = this.taskManager.getTask(taskId);
    if (task) {
      this.stateManager.emitTaskUpdated(task);
    }
  }

  /**
   * Handle FLOW_STEP_COMPLETED message
   */
  handleFlowStepCompleted(message: FlowStepCompletedMessage): void {
    const { workerId, taskId, stepId, outputs } = message;
    Logger.log(`[WS] Worker ${workerId} completed flow step ${stepId} for task ${taskId}`);

    const outputInfo = outputs ? ` with ${Object.keys(outputs).length} output(s)` : '';
    this.taskManager.addComment(taskId, 'system', `Flow step completed: ${stepId}${outputInfo}`);

    const task = this.taskManager.getTask(taskId);
    if (task) {
      this.stateManager.emitTaskUpdated(task);
    }
  }

  /**
   * Handle FLOW_STEP_FAILED message
   */
  handleFlowStepFailed(message: FlowStepFailedMessage): void {
    const { workerId, taskId, stepId, error } = message;
    Logger.error(`[WS] Worker ${workerId} flow step ${stepId} failed for task ${taskId}: ${error}`);

    this.taskManager.addComment(taskId, 'system', `Flow step failed: ${stepId} - ${error}`);

    const task = this.taskManager.getTask(taskId);
    if (task) {
      this.stateManager.emitTaskUpdated(task);
    }
  }

  /**
   * Handle WORKSPACE_ALLOCATED message
   */
  handleWorkspaceAllocated(message: WorkspaceAllocatedMessage): void {
    const { workerId, taskId, workspaceId, workspacePath } = message;
    Logger.log(`[WS] Worker ${workerId} allocated workspace ${workspaceId} at ${workspacePath} for task ${taskId}`);

    this.taskManager.addComment(taskId, 'system', `Workspace allocated: ${workspacePath}`);

    // Store workspace info in task metadata
    const task = this.taskManager.getTask(taskId);
    if (task) {
      task.metadata = task.metadata || {};
      task.metadata.workspaceId = workspaceId;
      task.metadata.workspacePath = workspacePath;
      this.stateManager.emitTaskUpdated(task);
    }
  }

  /**
   * Handle WORKSPACE_RELEASED message
   */
  handleWorkspaceReleased(message: WorkspaceReleasedMessage): void {
    const { workerId, taskId, workspaceId } = message;
    Logger.log(`[WS] Worker ${workerId} released workspace ${workspaceId} for task ${taskId}`);

    this.taskManager.addComment(taskId, 'system', `Workspace released: ${workspaceId}`);

    const task = this.taskManager.getTask(taskId);
    if (task) {
      this.stateManager.emitTaskUpdated(task);
    }
  }

  /**
   * Handle STOP_REQUESTED message
   */
  handleStopRequested(message: StopRequestedMessage): void {
    const { workerId, taskId } = message;
    Logger.log(`[WS] Stop requested from worker ${workerId}, task ${taskId}`);

    const worker = this.connectionManager.getWorker(workerId);
    if (worker) {
      this.connectionManager.sendMessage(worker.socket, createMessage(MessageType.KILL_CLAUDE, {
        reason: 'stop_requested'
      }));
    }
  }

  /**
   * Handle HOOK_EVENT message
   */
  handleHookEvent(message: HookEventMessage): void {
    const { workerId, hookName, data } = message;
    Logger.log(`[WS] Hook event ${hookName} from worker ${workerId}`);

    // TODO: Log to knowledge base if relevant
  }
}
