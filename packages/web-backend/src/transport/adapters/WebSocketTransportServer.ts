import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

import type { EventData, EventType, SubscriptionMessage, TransportEvent, TransportRequest } from '@app/shared';

import type { ITransportServer } from '../ITransportServer';
import type { TransportRouter } from '../TransportRouter';
import type { WebSocketSessionManager } from '../WebSocketSessionManager';

/**
 * ===========================================================================================
 * WEBSOCKET TRANSPORT SERVER - MAIN WEBSOCKET SERVER IMPLEMENTATION
 * ===========================================================================================
 *
 * Implements ITransportServer using Fastify's @fastify/websocket plugin.
 *
 * Features:
 * - Authenticate connection from HTTP cookies via WebSocketSessionManager
 * - Send connection success with userId and tokenExpiresAt
 * - Handle incoming messages (subscription messages vs requests)
 * - Route requests through TransportRouter
 * - Validate session on every request
 * - Handle token expiration (close connection, send error)
 * - Handle subscriptions (update session manager)
 * - Broadcast events with subscription filtering
 * - Schedule expiration warning (2 minutes before)
 * - Clean disconnection
 *
 * WebSocket endpoint: GET /ws
 *
 * Message types:
 * - Connection: connected, auth_error, token_expired, token_expiring_soon
 * - Subscription: subscription, subscription_updated
 * - Request/Response: TransportRequest → TransportResponse
 * - Event: TransportEvent
 *
 * Security flow:
 * 1. Client connects to GET /ws
 * 2. Server parses cookies from upgrade request
 * 3. Server authenticates via WebSocketSessionManager
 * 4. Server sends 'connected' message with userId and tokenExpiresAt
 * 5. Client can now send requests and subscribe to events
 * 6. Server validates session on every message
 * 7. Server schedules expiration warning (2 minutes before)
 * 8. Server closes connection when token expires
 *
 * ===========================================================================================
 */

/**
 * WebSocket Transport Server
 */
export class WebSocketTransportServer implements ITransportServer {
	private clients = new Map<string, WebSocket>();
	private clientConnectedHandlers: Array<(clientId: string) => void> = [];
	private clientDisconnectedHandlers: Array<(clientId: string) => void> = [];
	private expirationTimers = new Map<string, NodeJS.Timeout>();

	constructor(
		private sessionManager: WebSocketSessionManager,
		private router: TransportRouter
	) {}

	/**
	 * Initialize WebSocket server
	 * Registers GET /ws endpoint with Fastify
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// Register @fastify/websocket plugin
		await app.register(fastifyWebsocket);

		// Register WebSocket endpoint
		// @ts-expect-error - Fastify websocket types are not fully compatible
		app.get('/ws', { websocket: true }, async (connection: { socket: WebSocket }, req: any) => {
			await this.handleConnection(connection.socket, req);
		});
	}

	/**
	 * Handle new WebSocket connection
	 */
	private async handleConnection(socket: WebSocket, req: any): Promise<void> {
		const clientId = this.generateClientId();

		try {
			// Authenticate from HTTP cookies
			const session = await this.sessionManager.authenticateConnection(clientId, req.raw);

			// Store client
			this.clients.set(clientId, socket);

			// Send connection success
			this.sendMessage(socket, {
				type: 'connected',
				clientId,
				userId: session.userId,
				tokenExpiresAt: session.tokenExpiresAt,
			});

			console.log(`[WS] Connected: client=${clientId}, user=${session.userId}`);

			// Notify connection handlers
			this.clientConnectedHandlers.forEach(handler => handler(clientId));

			// Schedule expiration warning
			this.scheduleExpirationWarning(clientId, session.tokenExpiresAt);

			// Handle incoming messages
			socket.on('message', async (rawMessage: Buffer) => {
				await this.handleMessage(clientId, socket, rawMessage);
			});

			// Handle disconnection
			socket.on('close', () => {
				this.handleDisconnection(clientId);
			});

			// Handle errors
			socket.on('error', error => {
				console.error(`[WS] Error: client=${clientId}`, error);
			});
		} catch (error: any) {
			console.error('[WS] Authentication failed', error);

			// Send auth error
			this.sendMessage(socket, {
				type: 'auth_error',
				message: error.message || 'Authentication failed',
			});

			// Close connection
			socket.close();
		}
	}

	/**
	 * Handle incoming WebSocket message
	 */
	private async handleMessage(clientId: string, socket: WebSocket, rawMessage: Buffer): Promise<void> {
		try {
			const message = JSON.parse(rawMessage.toString());

			// Handle subscription messages
			if (message.type === 'subscription') {
				this.handleSubscription(clientId, socket, message as SubscriptionMessage);
				return;
			}

			// Handle requests
			if (message.id && message.method) {
				await this.handleRequest(clientId, socket, message as TransportRequest);
				return;
			}

			// Unknown message type
			console.warn('[WS] Unknown message type:', message);
		} catch (error) {
			console.error('[WS] Message parsing error:', error);

			this.sendMessage(socket, {
				type: 'error',
				message: 'Failed to parse message',
			});
		}
	}

	/**
	 * Handle subscription control message
	 */
	private handleSubscription(clientId: string, socket: WebSocket, message: SubscriptionMessage): void {
		const { action, events } = message;

		// Update subscriptions in session manager
		this.sessionManager.updateSubscriptions(clientId, action, events);

		// Confirm subscription
		this.sendMessage(socket, {
			type: 'subscription_updated',
			action,
			events,
		});
	}

	/**
	 * Handle TransportRequest
	 */
	private async handleRequest(clientId: string, socket: WebSocket, request: TransportRequest): Promise<void> {
		try {
			// Validate session on every request
			const { userId } = this.sessionManager.validateSession(clientId);

			// Add userId to request context
			(request as any).userId = userId;

			// Route request through TransportRouter
			const response = await this.router.handleRequest(request);

			// Send response
			this.sendMessage(socket, response);
		} catch (error: any) {
			console.error('[WS] Request handling error:', error);

			// Check if token expired
			if (error.message === 'Access token expired') {
				this.sendMessage(socket, {
					type: 'token_expired',
					message: 'Access token expired, please refresh',
				});

				// Close connection
				socket.close();
				return;
			}

			// Send error response
			this.sendMessage(socket, {
				id: request.id,
				status: 500,
				error: {
					code: 'INTERNAL_ERROR',
					message: error.message || 'Internal server error',
				},
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Schedule expiration warning
	 * Warns client 2 minutes before token expires
	 */
	private scheduleExpirationWarning(clientId: string, expiresAt: number): void {
		const timeUntilExpiry = expiresAt - Date.now();

		// Warn 2 minutes (120000ms) before expiration
		const warningTime = Math.max(0, timeUntilExpiry - 120000);

		const timer = setTimeout(() => {
			const socket = this.clients.get(clientId);

			if (socket && socket.readyState === 1) {
				// 1 = OPEN
				this.sendMessage(socket, {
					type: 'token_expiring_soon',
					expiresAt,
					timeRemaining: expiresAt - Date.now(),
				});
			}
		}, warningTime);

		this.expirationTimers.set(clientId, timer);
	}

	/**
	 * Handle client disconnection
	 */
	private handleDisconnection(clientId: string): void {
		console.log(`[WS] Disconnected: client=${clientId}`);

		// Clear expiration timer
		const timer = this.expirationTimers.get(clientId);
		if (timer) {
			clearTimeout(timer);
			this.expirationTimers.delete(clientId);
		}

		// Remove client
		this.clients.delete(clientId);

		// Remove session
		this.sessionManager.removeSession(clientId);

		// Notify disconnection handlers
		this.clientDisconnectedHandlers.forEach(handler => handler(clientId));
	}

	/**
	 * Broadcast event to all connected clients
	 * Server-side subscription filtering is applied
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		const eventMessage: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

		const message = JSON.stringify(eventMessage);
		let sentCount = 0;
		let filteredCount = 0;

		this.clients.forEach((socket, clientId) => {
			// Check if socket is open
			if (socket.readyState !== 1) {
				// 1 = OPEN
				return;
			}

			// Check if client is subscribed to this event
			if (!this.sessionManager.isSubscribed(clientId, event)) {
				filteredCount++;
				return;
			}

			try {
				socket.send(message);
				sentCount++;
			} catch (error) {
				console.error(`[WS] Failed to send event to client ${clientId}`, error);
			}
		});

		if (filteredCount > 0) {
			console.log(`[WS] Broadcast ${event}: sent=${sentCount}, filtered=${filteredCount}`);
		}
	}

	/**
	 * Send event to specific client
	 * Checks subscription before sending
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
		const socket = this.clients.get(clientId);

		if (!socket || socket.readyState !== 1) {
			// 1 = OPEN
			console.warn(`[WS] Client ${clientId} not connected`);
			return;
		}

		// Check subscription
		if (!this.sessionManager.isSubscribed(clientId, event)) {
			console.log(`[WS] Client ${clientId} not subscribed to ${event}, skipping`);
			return;
		}

		const eventMessage: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

		try {
			this.sendMessage(socket, eventMessage);
		} catch (error) {
			console.error(`[WS] Failed to send event to client ${clientId}`, error);
		}
	}

	/**
	 * Register handler for client connections
	 */
	onClientConnected(handler: (clientId: string) => void): void {
		this.clientConnectedHandlers.push(handler);
	}

	/**
	 * Register handler for client disconnections
	 */
	onClientDisconnected(handler: (clientId: string) => void): void {
		this.clientDisconnectedHandlers.push(handler);
	}

	/**
	 * Get list of connected client IDs
	 */
	getConnectedClients(): string[] {
		return Array.from(this.clients.keys());
	}

	/**
	 * Send message to WebSocket
	 */
	private sendMessage(socket: WebSocket, message: any): void {
		if (socket.readyState === 1) {
			// 1 = OPEN
			socket.send(JSON.stringify(message));
		}
	}

	/**
	 * Generate unique client ID
	 */
	private generateClientId(): string {
		return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Generate unique event ID
	 */
	private generateEventId(): string {
		return `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Stop the WebSocket server and clean up resources
	 * Closes all client connections, clears timers, and resets state
	 */
	stop(): void {
		// Clear all expiration timers
		this.expirationTimers.forEach(timer => {
			clearTimeout(timer);
		});
		this.expirationTimers.clear();

		// Close all client connections gracefully
		this.clients.forEach(socket => {
			try {
				if (socket && socket.readyState === 1) {
					// 1 = OPEN
					socket.close(1000, 'Server shutting down');
				}
			} catch (_error) {
				// Ignore errors when closing sockets
			}
		});
		this.clients.clear();

		// Clear event handlers
		this.clientConnectedHandlers = [];
		this.clientDisconnectedHandlers = [];
	}
}
