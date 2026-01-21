import { createLogger } from 'shared-common/logger';
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
import { TraceChunkStorage } from '../core/TraceChunkStorage';
import type { WorkerCoordinator } from '../core/WorkerCoordinator';
import type { WebSocketConnectionManager } from './WebSocketConnectionManager';

const log = createLogger('WebSocketEventHandler');

/**
 * Handles all task-related and flow-related events from workers
 * Responsibilities:
 * - Process task lifecycle events (started, progress, completed, failed)
 * - Handle flow step events
 * - Handle workspace events
 * - Delegate events to WorkerCoordinator which forwards to backend
 */
export class WebSocketEventHandler {
	private workerCoordinator: WorkerCoordinator;
	private stateManager: StateManager;
	private connectionManager: WebSocketConnectionManager;
	private interventionManager: InterventionManager;
	private traceStorage: TraceChunkStorage;

	constructor(
		workerCoordinator: WorkerCoordinator,
		stateManager: StateManager,
		connectionManager: WebSocketConnectionManager,
		interventionManager: InterventionManager,
		traceStorage?: TraceChunkStorage
	) {
		this.workerCoordinator = workerCoordinator;
		this.stateManager = stateManager;
		this.connectionManager = connectionManager;
		this.interventionManager = interventionManager;
		this.traceStorage = traceStorage || new TraceChunkStorage();
	}

	/**
	 * Handle TASK_STARTED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleTaskStarted(message: W2OTaskStartedMessage): void {
		const { workerId, taskId } = message;
		log.info(`[WS] Worker ${workerId} started task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle TASK_PROGRESS message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleTaskProgress(message: W2OTaskProgressMessage): void {
		const { workerId, taskId, progress } = message;
		log.info(`[WS] Worker ${workerId} progress on task ${taskId}: ${progress}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle TASK_COMPLETED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	async handleTaskCompleted(message: W2OTaskCompletedMessage): Promise<void> {
		const { workerId, taskId } = message;
		log.info(`[WS] Worker ${workerId} completed task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		// Backend handles trace storage and task updates
		this.workerCoordinator.onWorkerMessage(workerId, message);

		// Release the worker locally (WorkerCoordinator also marks worker as idle)
		this.connectionManager.releaseWorker(workerId);
	}

	/**
	 * Handle TASK_FAILED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	async handleTaskFailed(message: W2OTaskFailedMessage): Promise<void> {
		const { workerId, taskId, error } = message;
		log.error(`[WS] Worker ${workerId} failed task ${taskId}: ${error}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		// Backend handles task updates and status changes
		this.workerCoordinator.onWorkerMessage(workerId, message);

		// Release the worker locally (WorkerCoordinator also marks worker as idle)
		const worker = this.connectionManager.getWorker(workerId);
		if (worker) {
			worker.taskId = null;
			this.stateManager.emitWorkerTaskReleased(workerId);
		}
	}

	/**
	 * Handle TASK_TRACE_UPDATE message (real-time trace updates every 500ms)
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	async handleTaskTraceUpdate(message: W2OTaskTraceUpdateMessage): Promise<void> {
		const { workerId, taskId, trace } = message;
		log.debug(`[WS] Worker ${workerId} sent trace update for task ${taskId} (${trace?.steps?.length || 0} steps)`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		// Backend handles trace storage
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle TASK_QUESTION message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleTaskQuestion(message: W2OTaskQuestionMessage): void {
		const { workerId, taskId, question } = message;
		log.info(`[WS] Worker ${workerId} has a question on task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle FLOW_STEP_STARTED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleFlowStepStarted(message: W2OFlowStepStartedMessage): void {
		const { workerId, taskId, stepId, stepName } = message;
		log.info(`[WS] Worker ${workerId} started flow step ${stepId} (${stepName}) for task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle FLOW_STEP_COMPLETED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleFlowStepCompleted(message: W2OFlowStepCompletedMessage): void {
		const { workerId, taskId, stepId } = message;
		log.info(`[WS] Worker ${workerId} completed flow step ${stepId} for task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle FLOW_STEP_FAILED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleFlowStepFailed(message: W2OFlowStepFailedMessage): void {
		const { workerId, taskId, stepId, error } = message;
		log.error(`[WS] Worker ${workerId} flow step ${stepId} failed for task ${taskId}: ${error}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle WORKSPACE_ALLOCATED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleWorkspaceAllocated(message: W2OWorkspaceAllocatedMessage): void {
		const { workerId, taskId, workspaceId, workspacePath } = message;
		log.info(`[WS] Worker ${workerId} allocated workspace ${workspaceId} at ${workspacePath} for task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle WORKSPACE_RELEASED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 */
	handleWorkspaceReleased(message: W2OWorkspaceReleasedMessage): void {
		const { workerId, taskId, workspaceId } = message;
		log.info(`[WS] Worker ${workerId} released workspace ${workspaceId} for task ${taskId}`);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);
	}

	/**
	 * Handle STOP_REQUESTED message
	 */
	handleStopRequested(message: REMOVE_W2OStopRequestedMessage): void {
		const { workerId, taskId } = message;
		log.info(`[WS] Stop requested from worker ${workerId}, task ${taskId}`);

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
		log.info(`[WS] Hook event ${hookName} from worker ${workerId}`);

		// TODO: Log to knowledge base if relevant
	}

	/**
	 * Handle INTERVENTION_REQUESTED message
	 * Delegates to WorkerCoordinator which forwards to backend
	 *
	 * Note: InterventionManager is still used for backward compatibility
	 * but should eventually be moved to backend as well
	 */
	async handleInterventionRequested(message: W2OInterventionRequestedMessage): Promise<void> {
		const { workerId, taskId, interventionId, flowId, stepId, interventionType, blocking, config, timeout } =
			message;
		log.info(
			`[WS] Worker ${workerId} requested ${interventionType} intervention for task ${taskId} step ${stepId} (id: ${interventionId})`
		);

		// Delegate to WorkerCoordinator which forwards to backend via BackendEventBridge
		this.workerCoordinator.onWorkerMessage(workerId, message);

		// TODO: Remove InterventionManager usage once backend handles interventions
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

			log.info(`[WS] Created intervention ${intervention.id} for task ${taskId}`);

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
			log.error(`[WS] Failed to create intervention for task ${taskId}:`, error);

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
