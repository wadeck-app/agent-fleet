import { logger } from 'shared-common/logger';
import type { StateManager } from 'shared-orch-worker/StateManager';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { O2WMessageType, createO2WMessage } from 'shared-orch-worker/orchestrator-messages';
import type {
	REMOVE_W2OStopRequestedMessage,
	W2OFlowStepCompletedMessage,
	W2OFlowStepFailedMessage,
	W2OFlowStepStartedMessage,
	W2OHookEventMessage,
	W2OTaskCompletedMessage,
	W2OTaskFailedMessage,
	W2OTaskProgressMessage,
	W2OTaskQuestionMessage,
	W2OTaskStartedMessage,
	W2OWorkspaceAllocatedMessage,
	W2OWorkspaceReleasedMessage,
} from 'shared-orch-worker/worker-messages';

import type { TaskManager } from '../core/TaskManager';
import type { WebSocketConnectionManager } from './WebSocketConnectionManager';

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

	constructor(taskManager: TaskManager, stateManager: StateManager, connectionManager: WebSocketConnectionManager) {
		this.taskManager = taskManager;
		this.stateManager = stateManager;
		this.connectionManager = connectionManager;
	}

	/**
	 * Handle TASK_STARTED message
	 */
	handleTaskStarted(message: W2OTaskStartedMessage): void {
		const { workerId, taskId, newStatus } = message;
		logger.info(`[WS] Worker ${workerId} started task ${taskId}`);

		const status = newStatus || TaskStatus.IN_PROGRESS;
		this.taskManager.updateTaskStatus(taskId, status, {
			event: 'started',
			workerId,
		});
	}

	/**
	 * Handle TASK_PROGRESS message
	 */
	handleTaskProgress(message: W2OTaskProgressMessage): void {
		const { workerId, taskId, progress } = message;
		logger.info(`[WS] Worker ${workerId} progress on task ${taskId}: ${progress}`);

		this.taskManager.addComment(taskId, `worker-${workerId}`, progress);
	}

	/**
	 * Handle TASK_COMPLETED message
	 */
	handleTaskCompleted(message: W2OTaskCompletedMessage): void {
		const { workerId, taskId, result, newStatus } = message;
		logger.info(`[WS] Worker ${workerId} completed task ${taskId}`);

		const status = newStatus || TaskStatus.REVIEW;
		this.taskManager.updateTaskStatus(taskId, status, {
			event: 'completed',
			workerId,
			result,
		});

		// Release the worker
		this.connectionManager.releaseWorker(workerId);
	}

	/**
	 * Handle TASK_FAILED message
	 */
	handleTaskFailed(message: W2OTaskFailedMessage): void {
		const { workerId, taskId, error, newStatus } = message;
		logger.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

		// Use the provided status or default to BLOCKED
		const failureStatus = newStatus || TaskStatus.BLOCKED;

		this.taskManager.updateTaskStatus(taskId, failureStatus, {
			event: 'failed',
			workerId,
			error,
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
	handleTaskQuestion(message: W2OTaskQuestionMessage): void {
		const { workerId, taskId, question } = message;
		logger.info(`[WS] Worker ${workerId} has a question on task ${taskId}`);

		this.taskManager.updateTaskStatus(taskId, TaskStatus.BLOCKED, {
			event: 'question_raised',
			workerId,
			question,
		});

		this.taskManager.addComment(taskId, `worker-${workerId}`, `Question: ${question}`);
	}

	/**
	 * Handle FLOW_STEP_STARTED message
	 */
	handleFlowStepStarted(message: W2OFlowStepStartedMessage): void {
		const { workerId, taskId, stepId, stepName } = message;
		logger.info(`[WS] Worker ${workerId} started flow step ${stepId} (${stepName}) for task ${taskId}`);

		this.taskManager.addComment(taskId, 'system', `Flow step started: ${stepName || stepId}`);

		const task = this.taskManager.getTask(taskId);
		if (task) {
			this.stateManager.emitTaskUpdated(task);
		}
	}

	/**
	 * Handle FLOW_STEP_COMPLETED message
	 */
	handleFlowStepCompleted(message: W2OFlowStepCompletedMessage): void {
		const { workerId, taskId, stepId, outputs } = message;
		logger.info(`[WS] Worker ${workerId} completed flow step ${stepId} for task ${taskId}`);

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
	handleFlowStepFailed(message: W2OFlowStepFailedMessage): void {
		const { workerId, taskId, stepId, error } = message;
		logger.error(`[WS] Worker ${workerId} flow step ${stepId} failed for task ${taskId}: ${error}`);

		this.taskManager.addComment(taskId, 'system', `Flow step failed: ${stepId} - ${error}`);

		const task = this.taskManager.getTask(taskId);
		if (task) {
			this.stateManager.emitTaskUpdated(task);
		}
	}

	/**
	 * Handle WORKSPACE_ALLOCATED message
	 */
	handleWorkspaceAllocated(message: W2OWorkspaceAllocatedMessage): void {
		const { workerId, taskId, workspaceId, workspacePath } = message;
		logger.info(
			`[WS] Worker ${workerId} allocated workspace ${workspaceId} at ${workspacePath} for task ${taskId}`
		);

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
	handleWorkspaceReleased(message: W2OWorkspaceReleasedMessage): void {
		const { workerId, taskId, workspaceId } = message;
		logger.info(`[WS] Worker ${workerId} released workspace ${workspaceId} for task ${taskId}`);

		this.taskManager.addComment(taskId, 'system', `Workspace released: ${workspaceId}`);

		const task = this.taskManager.getTask(taskId);
		if (task) {
			this.stateManager.emitTaskUpdated(task);
		}
	}

	/**
	 * Handle STOP_REQUESTED message
	 */
	handleStopRequested(message: REMOVE_W2OStopRequestedMessage): void {
		const { workerId, taskId } = message;
		logger.info(`[WS] Stop requested from worker ${workerId}, task ${taskId}`);

		const worker = this.connectionManager.getWorker(workerId);
		if (worker) {
			this.connectionManager.sendMessage(
				worker.socket,
				createO2WMessage(O2WMessageType.KILL_CLAUDE, {
					reason: 'stop_requested',
				})
			);
		}
	}

	/**
	 * Handle HOOK_EVENT message
	 */
	handleHookEvent(message: W2OHookEventMessage): void {
		const { workerId, hookName, data } = message;
		logger.info(`[WS] Hook event ${hookName} from worker ${workerId}`);

		// TODO: Log to knowledge base if relevant
	}
}
