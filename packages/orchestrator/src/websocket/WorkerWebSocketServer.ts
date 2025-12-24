import { logger } from 'shared-common/logger';
import { createMessage, parseMessage } from 'shared-common/protocol';
import { StateManager } from 'shared-orch-worker/StateManager';
import { WorkerInfo } from 'shared-orch-worker/domain-types';
import { O2WMessage, O2WMessageType } from 'shared-orch-worker/orchestrator-messages';
import { W2OMessage, W2OMessageType } from 'shared-orch-worker/worker-messages';
import { WebSocket, WebSocketServer } from 'ws';

import { TaskManager } from '../core/TaskManager';
import { WebSocketConnectionManager } from './WebSocketConnectionManager';
import { WebSocketEventHandler } from './WebSocketEventHandler';
import { WebSocketMessageRouter } from './WebSocketMessageRouter';

/**
 * Main WebSocket server that coordinates worker connections and message routing
 * Responsibilities:
 * - Setup and manage WebSocket server
 * - Coordinate specialized components
 * - Handle connection lifecycle
 */
export class WorkerWebSocketServer {
	private wss: WebSocketServer;
	private port: number;
	private connectionManager: WebSocketConnectionManager;
	private eventHandler: WebSocketEventHandler;
	private messageRouter: WebSocketMessageRouter;

	constructor(taskManager: TaskManager, stateManager: StateManager, port: number = 3738) {
		this.port = port;

		// Initialize components
		this.connectionManager = new WebSocketConnectionManager(taskManager, stateManager);
		this.eventHandler = new WebSocketEventHandler(taskManager, stateManager, this.connectionManager);
		this.messageRouter = new WebSocketMessageRouter(this.connectionManager, this.eventHandler);

		// Setup WebSocket server
		this.wss = new WebSocketServer({ port: this.port });
		this.setupServer();
	}

	private setupServer(): void {
		this.wss.on('connection', (socket: WebSocket) => {
			logger.debug('[WS] New worker connection');
			this.handleConnection(socket);
		});

		this.wss.on('error', error => {
			logger.error('[WS] Server error:', error);
		});

		logger.debug(`[WS] WebSocket server listening on port ${this.port}`);
	}

	private handleConnection(socket: WebSocket): void {
		let workerId: string | null = null;

		socket.on('message', (data: Buffer) => {
			try {
				const message = parseMessage(data.toString()) as W2OMessage;

				const result = this.messageRouter.routeMessage(socket, message, workerId);
				// If routeMessage returns a workerId, update it
				if (result && typeof result === 'string') {
					workerId = result;
				}
			} catch (error) {
				logger.error('[WS] Error parsing message:', (error as Error).message);
				this.connectionManager.sendMessage(
					socket,
					createMessage(O2WMessageType.ERROR, {
						error: (error as Error).message,
					})
				);
			}
		});

		socket.on('close', () => {
			if (workerId) {
				this.connectionManager.handleWorkerDisconnect(workerId);
			}
		});

		socket.on('error', error => {
			logger.error('[WS] Socket error:', error);
		});
	}

	/**
	 * Get all workers
	 */
	getWorkers(): WorkerInfo[] {
		return this.connectionManager.getWorkers();
	}

	/**
	 * Try to assign tasks to idle workers
	 */
	tryAssignTasksToIdleWorkers(): void {
		this.connectionManager.tryAssignTasksToIdleWorkers();
	}

	getPort(): number {
		return this.port;
	}

	/**
	 * Get the connection manager
	 */
	getConnectionManager(): WebSocketConnectionManager {
		return this.connectionManager;
	}

	async stop(): Promise<void> {
		return new Promise(resolve => {
			// Close all worker connections
			this.connectionManager.closeAll();

			this.wss.close(() => {
				logger.debug('[WS] WebSocket server stopped');
				resolve();
			});
		});
	}
}
