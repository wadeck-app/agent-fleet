import { Logger } from 'shared-common/Logger.js';
import { createMessage } from 'shared-common/protocol.js';
import {
	FlowStepCompletedMessage,
	FlowStepFailedMessage,
	FlowStepStartedMessage,
	FlowsUpdatedMessage,
	HookEventMessage,
	Message,
	MessageType,
	RequestTaskMessage,
	StopRequestedMessage,
	TaskCompletedMessage,
	TaskFailedMessage,
	TaskProgressMessage,
	TaskQuestionMessage,
	TaskStartedMessage,
	WorkerReadyMessage,
	WorkspaceAllocatedMessage,
	WorkspaceReleasedMessage,
} from 'shared-orch-worker/index.js';
import { WebSocket } from 'ws';

import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';
import { WebSocketEventHandler } from './WebSocketEventHandler.js';

/**
 * Routes WebSocket messages to appropriate handlers
 * Responsibilities:
 * - Parse and validate messages
 * - Route messages to correct handlers
 * - Handle heartbeats and unknown message types
 */
export class WebSocketMessageRouter {
	private connectionManager: WebSocketConnectionManager;
	private eventHandler: WebSocketEventHandler;

	constructor(connectionManager: WebSocketConnectionManager, eventHandler: WebSocketEventHandler) {
		this.connectionManager = connectionManager;
		this.eventHandler = eventHandler;
	}

	/**
	 * Route a message to the appropriate handler
	 * Returns workerId if this is a WORKER_READY message (for connection tracking)
	 */
	routeMessage(socket: WebSocket, message: Message, workerId: string | null): string | void {
		Logger.log(`[WS] Received ${message.type} from ${workerId || 'unknown'}`);

		switch (message.type) {
			case MessageType.WORKER_READY:
				return this.connectionManager.handleWorkerReady(socket, message as WorkerReadyMessage);

			case MessageType.WORKER_HEARTBEAT:
				this.connectionManager.sendMessage(socket, createMessage(MessageType.ACK, {}));
				break;

			case MessageType.TASK_STARTED:
				this.eventHandler.handleTaskStarted(message as TaskStartedMessage);
				break;

			case MessageType.TASK_PROGRESS:
				this.eventHandler.handleTaskProgress(message as TaskProgressMessage);
				break;

			case MessageType.TASK_COMPLETED:
				this.eventHandler.handleTaskCompleted(message as TaskCompletedMessage);
				break;

			case MessageType.TASK_FAILED:
				this.eventHandler.handleTaskFailed(message as TaskFailedMessage);
				break;

			case MessageType.TASK_QUESTION:
				this.eventHandler.handleTaskQuestion(message as TaskQuestionMessage);
				break;

			case MessageType.FLOW_STEP_STARTED:
				this.eventHandler.handleFlowStepStarted(message as FlowStepStartedMessage);
				break;

			case MessageType.FLOW_STEP_COMPLETED:
				this.eventHandler.handleFlowStepCompleted(message as FlowStepCompletedMessage);
				break;

			case MessageType.FLOW_STEP_FAILED:
				this.eventHandler.handleFlowStepFailed(message as FlowStepFailedMessage);
				break;

			case MessageType.WORKSPACE_ALLOCATED:
				this.eventHandler.handleWorkspaceAllocated(message as WorkspaceAllocatedMessage);
				break;

			case MessageType.WORKSPACE_RELEASED:
				this.eventHandler.handleWorkspaceReleased(message as WorkspaceReleasedMessage);
				break;

			case MessageType.STOP_REQUESTED:
				this.eventHandler.handleStopRequested(message as StopRequestedMessage);
				break;

			case MessageType.HOOK_EVENT:
				this.eventHandler.handleHookEvent(message as HookEventMessage);
				break;

			case MessageType.REQUEST_TASK:
				this.connectionManager.handleRequestTask(socket, message as RequestTaskMessage);
				break;

			case MessageType.FLOWS_UPDATED:
				this.connectionManager.handleFlowsUpdated(message as FlowsUpdatedMessage);
				break;

			default:
				console.warn(`[WS] Unknown message type: ${message.type}`);
		}
	}
}
