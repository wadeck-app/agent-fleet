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
	W2OInterventionRequestedMessage,
	W2OTaskCompletedMessage,
	W2OTaskFailedMessage,
	W2OTaskProgressMessage,
	W2OTaskQuestionMessage,
	W2OTaskStartedMessage,
	W2OTaskTraceUpdateMessage,
	W2OWorkspaceAllocatedMessage,
	W2OWorkspaceReleasedMessage,
} from 'shared-orch-worker/worker-messages';

import type { InterventionManager } from '../core/InterventionManager';
import type { TaskManager } from '../core/TaskManager';
import { TraceChunkStorage } from '../core/TraceChunkStorage';
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
	private interventionManager: InterventionManager;
	private traceStorage: TraceChunkStorage;

	constructor(
		taskManager: TaskManager,
		stateManager: StateManager,
		connectionManager: WebSocketConnectionManager,
		interventionManager: InterventionManager,
		traceStorage?: TraceChunkStorage
	) {
		this.taskManager = taskManager;
		this.stateManager = stateManager;
		this.connectionManager = connectionManager;
		this.interventionManager = interventionManager;
		this.traceStorage = traceStorage || new TraceChunkStorage();
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
	async handleTaskCompleted(message: W2OTaskCompletedMessage): Promise<void> {
		const { workerId, taskId, result, newStatus } = message;
		logger.info(`[WS] Worker ${workerId} completed task ${taskId}`);

		// Write final trace to chunks
		if (result?.trace) {
			try {
				await this.traceStorage.writeTraceFull(taskId, result.trace);
			} catch (error) {
				logger.error(`[WS] Failed to write final trace for task ${taskId}:`, error);
			}
		}

		// Update task with flowResult (without storing full trace in task.json)
		const task = this.taskManager.getTask(taskId);
		if (task && result) {
			task.flowResult = {
				status: 'completed',
				outputs: result.outputs || {},
				// Store only trace metadata in task.json
				trace: result.trace
					? {
							id: result.trace.id,
							taskId: result.trace.taskId,
							flowId: result.trace.flowId,
							workspaceId: result.trace.workspaceId,
							startTime: result.trace.startTime,
							endTime: result.trace.endTime,
							status: result.trace.status,
							steps: [], // Empty - stored in chunks
						}
					: undefined,
			};

			try {
				await this.taskManager.updateTask(task);
			} catch (error) {
				logger.error(`[WS] Failed to update task ${taskId} flowResult:`, error);
			}
		}

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
	async handleTaskFailed(message: W2OTaskFailedMessage): Promise<void> {
		const { workerId, taskId, error, newStatus } = message;
		logger.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

		// Update task with flowResult (error only for now, trace not included in failure message)
		const task = this.taskManager.getTask(taskId);
		if (task) {
			task.flowResult = {
				status: 'failed',
				error: error,
			};

			try {
				await this.taskManager.updateTask(task);
			} catch (updateError) {
				logger.error(`[WS] Failed to update task ${taskId} flowResult:`, updateError);
			}
		}

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
	 * Handle TASK_TRACE_UPDATE message (real-time trace updates every 500ms)
	 */
	async handleTaskTraceUpdate(message: W2OTaskTraceUpdateMessage): Promise<void> {
		const { workerId, taskId, trace } = message;
		logger.debug(
			`[WS] Worker ${workerId} sent trace update for task ${taskId} (${trace?.steps?.length || 0} steps)`
		);

		const task = this.taskManager.getTask(taskId);
		if (!task) {
			logger.warn(`[WS] Task ${taskId} not found for trace update`);
			return;
		}

		// Write trace incrementally to chunks
		try {
			await this.traceStorage.writeTraceIncremental(taskId, trace);
		} catch (error) {
			logger.error(`[WS] Failed to write trace chunks for task ${taskId}:`, error);
		}

		// Update task in-memory (without full trace for performance)
		// Store only metadata, actual logs are in chunks
		// Note: We keep status as 'completed' to satisfy type system, but task.status will be 'in_progress'
		task.flowResult = {
			status: 'completed', // Type constraint, actual execution status tracked by task.status
			trace: {
				id: trace.id,
				taskId: trace.taskId,
				flowId: trace.flowId,
				workspaceId: trace.workspaceId,
				startTime: trace.startTime,
				status: trace.status,
				steps: [], // Empty - stored in chunks
			},
		};

		// Emit event for real-time frontend updates
		// Use TASK_TRACE_UPDATED instead of TASK_UPDATED to avoid spamming backend
		// This allows frontend to subscribe ONLY to trace updates for specific taskId
		this.stateManager.emitTaskTraceUpdated(taskId, trace?.steps?.length || 0);
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

	/**
	 * Handle INTERVENTION_REQUESTED message
	 */
	async handleInterventionRequested(message: W2OInterventionRequestedMessage): Promise<void> {
		const { workerId, taskId, interventionId, flowId, stepId, interventionType, blocking, config, timeout } =
			message;
		logger.info(
			`[WS] Worker ${workerId} requested ${interventionType} intervention for task ${taskId} step ${stepId} (id: ${interventionId})`
		);

		try {
			// Create intervention using InterventionManager
			// Use the interventionId from the worker to ensure consistency
			const intervention = await this.interventionManager.createIntervention({
				id: interventionId, // Use the ID provided by the worker
				taskId,
				workerId,
				flowId,
				stepId,
				type: interventionType,
				source: {
					type: 'flow_step',
					stepId,
				},
				config,
				blocking,
				timeout,
			});

			logger.info(`[WS] Created intervention ${intervention.id} for task ${taskId}`);

			// Emit event for UI to show intervention
			this.stateManager.emit('intervention.created', intervention);

			// For non-blocking interventions, send immediate response
			if (!blocking) {
				const worker = this.connectionManager.getWorker(workerId);
				if (worker) {
					this.connectionManager.sendMessage(
						worker.socket,
						createO2WMessage(O2WMessageType.INTERVENTION_RESPONSE, {
							taskId,
							interventionId: intervention.id,
							response: null,
						})
					);
				}
			}
		} catch (error) {
			logger.error(`[WS] Failed to create intervention for task ${taskId}:`, error);

			// Send error response to worker
			const worker = this.connectionManager.getWorker(workerId);
			if (worker) {
				this.connectionManager.sendMessage(
					worker.socket,
					createO2WMessage(O2WMessageType.ERROR, {
						error: error instanceof Error ? error.message : 'Failed to create intervention',
					})
				);
			}
		}
	}

	/**
	 * Handle generic worker messages (for OrchestratorWrapper)
	 * Emits messages as worker.message events for custom handlers
	 */
	handleGenericWorkerMessage(message: any): void {
		// Emit generic worker message event for OrchestratorWrapper to handle
		this.stateManager.emit('worker.message', message);
	}
}
