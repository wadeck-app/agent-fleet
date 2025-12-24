import { logger } from 'shared-common/logger';
import { createMessage } from 'shared-common/protocol';
import { O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import { W2OMessage, W2OMessageType } from 'shared-orch-worker/worker-messages';
import { WebSocket } from 'ws';

import { WebSocketConnectionManager } from './WebSocketConnectionManager';
import { WebSocketEventHandler } from './WebSocketEventHandler';

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
	routeMessage(socket: WebSocket, message: W2OMessage, workerId: string | null): string | void {
		logger.info(`[WS] Received ${message.type} from ${workerId || 'unknown'}`);

		switch (message.type) {
			case W2OMessageType.WORKER_READY:
				return this.connectionManager.handleWorkerReady(socket, message);

			case W2OMessageType.WORKER_HEARTBEAT:
				this.connectionManager.sendMessage(socket, createMessage(O2WMessageType.ACK, {}));
				break;

			case W2OMessageType.TASK_STARTED:
				this.eventHandler.handleTaskStarted(message);
				break;

			case W2OMessageType.TASK_PROGRESS:
				this.eventHandler.handleTaskProgress(message);
				break;

			case W2OMessageType.TASK_COMPLETED:
				this.eventHandler.handleTaskCompleted(message);
				break;

			case W2OMessageType.TASK_FAILED:
				this.eventHandler.handleTaskFailed(message);
				break;

			case W2OMessageType.TASK_QUESTION:
				this.eventHandler.handleTaskQuestion(message);
				break;

			case W2OMessageType.FLOW_STEP_STARTED:
				this.eventHandler.handleFlowStepStarted(message);
				break;

			case W2OMessageType.FLOW_STEP_COMPLETED:
				this.eventHandler.handleFlowStepCompleted(message);
				break;

			case W2OMessageType.FLOW_STEP_FAILED:
				this.eventHandler.handleFlowStepFailed(message);
				break;

			case W2OMessageType.WORKSPACE_ALLOCATED:
				this.eventHandler.handleWorkspaceAllocated(message);
				break;

			case W2OMessageType.WORKSPACE_RELEASED:
				this.eventHandler.handleWorkspaceReleased(message);
				break;

			case W2OMessageType.STOP_REQUESTED:
				this.eventHandler.handleStopRequested(message);
				break;

			case W2OMessageType.HOOK_EVENT:
				this.eventHandler.handleHookEvent(message);
				break;

			case W2OMessageType.REQUEST_TASK:
				this.connectionManager.handleRequestTask(socket, message);
				break;

			case W2OMessageType.FLOWS_UPDATED:
				this.connectionManager.handleFlowsUpdated(message);
				break;

			default:
				console.warn(`[WS] Unknown message type: ${(message as unknown as any).type}`);
		}
	}
}
