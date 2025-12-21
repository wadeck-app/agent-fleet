import { Logger } from 'shared-common/Logger.js';
import { WebSocket, WebSocketServer } from 'ws';

import { UIClientHook } from '../ui-client/UIClientHook.js';

/**
 * WebSocket server for UI clients
 *
 * Responsibilities:
 * - Accept UI client WebSocket connections
 * - Broadcast state updates from UIClientHook to all connected UI clients
 * - Send initial snapshot when clients connect
 * - Handle client disconnections
 *
 * Event Flow:
 * StateManager → UIClientHook → UIWebSocketServer → UI Clients (browsers)
 */
export class UIWebSocketServer {
	private clients: Set<WebSocket> = new Set();
	private uiClientHook: UIClientHook;
	private isActive: boolean = false;

	constructor(uiClientHook: UIClientHook) {
		this.uiClientHook = uiClientHook;
	}

	/**
	 * Start the server and begin listening to UIClientHook events
	 */
	start(): void {
		if (this.isActive) {
			Logger.logStructured('warn', 'UIWebSocketServer', 'Already started, ignoring start()');
			return;
		}

		// Listen to UIClientHook events and broadcast to all UI clients
		this.uiClientHook.on('state_update', data => {
			this.broadcast(JSON.stringify({ type: 'state_update', ...data }));
		});

		this.uiClientHook.on('command_result', data => {
			this.broadcast(JSON.stringify({ type: 'command_result', ...data }));
		});

		this.uiClientHook.on('error', data => {
			this.broadcast(JSON.stringify({ type: 'error', ...data }));
		});

		this.uiClientHook.on('snapshot', data => {
			this.broadcast(JSON.stringify({ type: 'snapshot', ...data }));
		});

		this.isActive = true;
		Logger.logStructured('info', 'UIWebSocketServer', 'Started and listening to UIClientHook events');
	}

	/**
	 * Stop the server and clean up all connections
	 */
	stop(): void {
		if (!this.isActive) {
			return;
		}

		// Remove all event listeners from UIClientHook
		this.uiClientHook.removeAllListeners('state_update');
		this.uiClientHook.removeAllListeners('command_result');
		this.uiClientHook.removeAllListeners('error');
		this.uiClientHook.removeAllListeners('snapshot');

		// Close all client connections
		this.clients.forEach(client => {
			if (client.readyState === WebSocket.OPEN) {
				client.close();
			}
		});
		this.clients.clear();

		this.isActive = false;
		Logger.logStructured('info', 'UIWebSocketServer', 'Stopped');
	}

	/**
	 * Handle a new WebSocket connection from a UI client
	 */
	handleConnection(socket: WebSocket): void {
		this.clients.add(socket);
		Logger.logStructured('info', 'UIWebSocketServer', `New UI client connected (total: ${this.clients.size})`);

		// Send initial snapshot to the new client
		this.sendInitialSnapshot(socket);

		// Handle client messages (for future commands/requests)
		socket.on('message', (data: Buffer) => {
			try {
				const message = JSON.parse(data.toString());
				this.handleClientMessage(socket, message);
			} catch (error) {
				Logger.logStructured('error', 'UIWebSocketServer', 'Error parsing client message', {
					error: (error as Error).message,
				});
			}
		});

		// Handle client disconnection
		socket.on('close', () => {
			this.clients.delete(socket);
			Logger.logStructured(
				'info',
				'UIWebSocketServer',
				`UI client disconnected (remaining: ${this.clients.size})`
			);
		});

		// Handle socket errors
		socket.on('error', error => {
			Logger.logStructured('error', 'UIWebSocketServer', 'Socket error', {
				error: error.message,
			});
		});
	}

	/**
	 * Send initial snapshot to a newly connected client
	 */
	private sendInitialSnapshot(socket: WebSocket): void {
		// Request snapshot from UIClientHook
		// The snapshot will be sent via the 'snapshot' event
		// For now, we'll send a simple welcome message
		const welcomeMessage = {
			type: 'connected',
			message: 'Connected to Agent Fleet orchestrator',
			timestamp: new Date().toISOString(),
		};

		this.sendToClient(socket, JSON.stringify(welcomeMessage));
		Logger.logStructured('debug', 'UIWebSocketServer', 'Sent welcome message to new client');
	}

	/**
	 * Handle messages from UI clients (for future commands/requests)
	 */
	private handleClientMessage(socket: WebSocket, message: any): void {
		Logger.logStructured('debug', 'UIWebSocketServer', 'Received client message', { message });

		// Future: Handle commands like 'request_snapshot', 'pause_updates', etc.
		// For now, just log
		if (message.type === 'request_snapshot') {
			// Request snapshot and it will be broadcasted via UIClientHook
			Logger.logStructured('debug', 'UIWebSocketServer', 'Client requested snapshot');
		}
	}

	/**
	 * Broadcast a message to all connected UI clients
	 */
	private broadcast(message: string): void {
		let successCount = 0;
		let failureCount = 0;

		this.clients.forEach(client => {
			if (this.sendToClient(client, message)) {
				successCount++;
			} else {
				failureCount++;
			}
		});

		if (failureCount > 0) {
			Logger.logStructured('debug', 'UIWebSocketServer', `Broadcast complete: ${successCount} success, ${failureCount} failed`);
		}
	}

	/**
	 * Send a message to a specific client
	 */
	private sendToClient(client: WebSocket, message: string): boolean {
		if (client.readyState === WebSocket.OPEN) {
			try {
				client.send(message);
				return true;
			} catch (error) {
				Logger.logStructured('error', 'UIWebSocketServer', 'Error sending to client', {
					error: (error as Error).message,
				});
				return false;
			}
		}
		return false;
	}

	/**
	 * Get number of connected UI clients
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Check if server is active
	 */
	isRunning(): boolean {
		return this.isActive;
	}
}
