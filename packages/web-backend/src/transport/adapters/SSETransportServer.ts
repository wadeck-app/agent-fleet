/**
 * Server-Sent Events (SSE) Transport Server
 *
 * Server-side implementation for SSE transport with:
 * - Unidirectional real-time events (Server → Client)
 * - Cookie-based authentication
 * - Automatic heartbeat to detect dead connections
 * - Message queue for events during disconnection
 * - Subscription management via HTTP endpoints
 *
 * SSE Benefits:
 * - Native browser support (EventSource API)
 * - Automatic reconnection by browser
 * - Simpler than WebSocket (no bidirectional complexity)
 * - Works through most firewalls and proxies
 *
 * Anti-fragility:
 * - Each SSE connection is independent
 * - Connection failure doesn't affect others
 * - Automatic cleanup of dead connections
 * - Graceful degradation if SSE not supported
 * - Message queue ensures no event loss
 *
 * @example
 * ```typescript
 * const server = new SSETransportServer(sessionManager, messageQueue);
 * await server.initialize(fastify);
 *
 * // Broadcast to all SSE clients
 * server.broadcast('b2f:task:created', task);
 * ```
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { EventData, EventType, TransportEvent } from '@app/shared/transport';

import type { ClientConnectedHandler, ClientDisconnectedHandler, ITransportServer } from '../ITransportServer';
import type { MessageQueue } from '../MessageQueue';
import type { TransportSessionManager } from '../TransportSessionManager';

/**
 * SSE Connection
 * Tracks an active SSE connection with its reply stream
 */
interface SSEConnection {
	/** Client ID */
	clientId: string;
	/** User ID */
	userId: string;
	/** Fastify reply for sending events */
	reply: FastifyReply;
	/** Last heartbeat sent timestamp */
	lastHeartbeat: number;
	/** Connection established timestamp */
	connectedAt: number;
}

/**
 * SSE Transport Server
 *
 * Implements ITransportServer using Server-Sent Events for
 * unidirectional real-time communication.
 */
export class SSETransportServer implements ITransportServer {
	/**
	 * Active SSE connections
	 * Map<clientId, SSEConnection>
	 */
	private connections = new Map<string, SSEConnection>();

	/**
	 * Client connection handlers
	 */
	private connectHandlers: ClientConnectedHandler[] = [];

	/**
	 * Client disconnection handlers
	 */
	private disconnectHandlers: ClientDisconnectedHandler[] = [];

	/**
	 * Heartbeat interval timer
	 */
	private heartbeatTimer: NodeJS.Timeout | null = null;

	/**
	 * Heartbeat interval in milliseconds
	 */
	private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

	/**
	 * Connection timeout (consider dead if no heartbeat for this long)
	 */
	private readonly CONNECTION_TIMEOUT = 60000; // 1 minute

	/**
	 * Create SSE Transport Server
	 *
	 * @param sessionManager - Session manager for authentication
	 * @param messageQueue - Message queue for offline event storage
	 */
	constructor(
		private sessionManager: TransportSessionManager,
		private messageQueue: MessageQueue
	) {}

	/**
	 * Initialize SSE server
	 * Registers SSE endpoint and subscription management
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// SSE events endpoint
		app.get('/sse', async (request, reply) => {
			await this.handleSSEConnection(request, reply);
		});

		// Subscription management endpoint
		app.post('/sse/subscription', async (request, reply) => {
			await this.handleSubscriptionUpdate(request, reply);
		});

		// Start heartbeat
		this.startHeartbeat();

		console.log('[SSE] Server initialized');
	}

	/**
	 * Handle SSE connection
	 */
	private async handleSSEConnection(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		const clientId = this.generateClientId();

		try {
			// Authenticate connection
			const session = await this.sessionManager.authenticateConnection(clientId, request.raw, 'sse');

			// Setup SSE headers
			reply.raw.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no', // Disable nginx buffering
			});

			// Create connection
			const connection: SSEConnection = {
				clientId,
				userId: session.userId,
				reply,
				lastHeartbeat: Date.now(),
				connectedAt: Date.now(),
			};

			this.connections.set(clientId, connection);

			console.log(`[SSE] Client ${clientId} connected (user=${session.userId}, total=${this.connections.size})`);

			// Send initial connected event with auth info
			this.sendSSEEvent(reply, 'connected', {
				userId: session.userId,
				tokenExpiresAt: session.tokenExpiresAt,
			});

			// Send any queued messages
			const queuedEvents = this.messageQueue.dequeue(clientId);
			if (queuedEvents.length > 0) {
				console.log(`[SSE] Sending ${queuedEvents.length} queued events to client ${clientId}`);
				for (const event of queuedEvents) {
					this.sendSSEEvent(reply, 'message', event);
				}
			}

			// Notify connection handlers
			this.connectHandlers.forEach(handler => handler(clientId));

			// Handle connection close
			request.raw.on('close', () => {
				this.handleDisconnection(clientId);
			});

			// Keep connection alive
			reply.raw.on('error', error => {
				console.error(`[SSE] Connection error for client ${clientId}:`, error);
				this.handleDisconnection(clientId);
			});
		} catch (error) {
			console.error('[SSE] Authentication failed:', error);

			// Send auth error and close
			reply.raw.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
			});

			this.sendSSEEvent(reply, 'auth_error', {
				message: error instanceof Error ? error.message : 'Authentication failed',
			});

			reply.raw.end();
		}
	}

	/**
	 * Handle subscription update (subscribe/unsubscribe)
	 */
	private async handleSubscriptionUpdate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Parse cookies for authentication
			const cookies = this.parseCookies(request.raw.headers.cookie || '');
			const accessToken = cookies['access_token'];

			// SECURITY: DEVELOPMENT ONLY - Bypass authentication if DISABLE_AUTH_DEV=true
			const disableAuthDev = process.env.DISABLE_AUTH_DEV === 'true';

			let userId: string;

			if (disableAuthDev && !accessToken) {
				// Mode DEV: pas d'auth, use mock user
				userId = 'dev-user-no-auth';
				console.log('[SSE] DEV MODE: Subscription without auth (user=dev-user-no-auth)');
			} else if (!accessToken) {
				reply.code(401).send({ error: 'Unauthorized' });
				return;
			} else {
				// Get user from token
				const result = await this.sessionManager['authService'].verifyAccessToken(accessToken);
				userId = result.userId;
			}

			// Get request body
			const body = request.body as {
				action: 'subscribe' | 'unsubscribe';
				events: string[];
				filters?: Record<string, unknown>;
			};

			// Find all SSE connections for this user
			const userConnections = Array.from(this.connections.values()).filter(conn => conn.userId === userId);

			if (userConnections.length === 0) {
				reply.code(404).send({ error: 'No active SSE connection found' });
				return;
			}

			// Update subscriptions for all user connections
			for (const conn of userConnections) {
				const session = this.sessionManager['sessions'].get(conn.clientId);
				if (!session) continue;

				if (body.action === 'subscribe') {
					body.events.forEach(event => {
						session.subscribedEvents.add(event);
						if (body.filters) {
							session.eventFilters.set(event, body.filters);
						}
					});
				} else {
					body.events.forEach(event => {
						session.subscribedEvents.delete(event);
						session.eventFilters.delete(event);
					});
				}

				// Send confirmation
				this.sendSSEEvent(conn.reply, 'subscription_updated', {
					action: body.action,
					events: body.events,
				});
			}

			console.log(
				`[SSE] ${body.action} for user ${userId}: ${body.events.join(', ')} (${userConnections.length} connections)`
			);

			reply.send({ success: true });
		} catch (error) {
			console.error('[SSE] Subscription update failed:', error);
			reply.code(500).send({ error: 'Internal server error' });
		}
	}

	/**
	 * Handle client disconnection
	 */
	private handleDisconnection(clientId: string): void {
		const connection = this.connections.get(clientId);
		if (!connection) return;

		this.connections.delete(clientId);
		this.sessionManager.removeSession(clientId);

		console.log(
			`[SSE] Client ${clientId} disconnected (user=${connection.userId}, total=${this.connections.size})`
		);

		// Notify disconnection handlers
		this.disconnectHandlers.forEach(handler => handler(clientId));
	}

	/**
	 * Broadcast event to all SSE clients
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		const transportEvent: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

		let sentCount = 0;
		let queuedCount = 0;

		for (const [clientId, connection] of this.connections) {
			// Check if client is subscribed
			const session = this.sessionManager['sessions'].get(clientId);
			if (!session || !session.subscribedEvents.has(event)) {
				continue;
			}

			// Check filters
			if (!this.matchesFilters(data, session.eventFilters.get(event))) {
				continue;
			}

			try {
				this.sendSSEEvent(connection.reply, 'message', transportEvent);
				sentCount++;
			} catch (error) {
				console.error(`[SSE] Failed to send to client ${clientId}:`, error);
				// Queue for later delivery
				this.messageQueue.enqueue(clientId, transportEvent);
				queuedCount++;
			}
		}

		if (sentCount > 0 || queuedCount > 0) {
			console.log(`[SSE] Broadcast ${event}: sent=${sentCount}, queued=${queuedCount}`);
		}
	}

	/**
	 * Send event to specific client
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
		const connection = this.connections.get(clientId);
		if (!connection) {
			// Client not connected, queue the message
			const transportEvent: TransportEvent = {
				id: this.generateEventId(),
				type: event,
				data,
				timestamp: Date.now(),
			};
			this.messageQueue.enqueue(clientId, transportEvent);
			console.log(`[SSE] Queued event ${event} for offline client ${clientId}`);
			return;
		}

		// Check if client is subscribed
		const session = this.sessionManager['sessions'].get(clientId);
		if (!session || !session.subscribedEvents.has(event)) {
			return;
		}

		// Check filters
		if (!this.matchesFilters(data, session.eventFilters.get(event))) {
			return;
		}

		const transportEvent: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

		try {
			this.sendSSEEvent(connection.reply, 'message', transportEvent);
		} catch (error) {
			console.error(`[SSE] Failed to send to client ${clientId}:`, error);
			this.messageQueue.enqueue(clientId, transportEvent);
		}
	}

	/**
	 * Send SSE event
	 */
	private sendSSEEvent(reply: FastifyReply, eventType: string, data: unknown): void {
		const payload = JSON.stringify(data);
		reply.raw.write(`event: ${eventType}\n`);
		reply.raw.write(`data: ${payload}\n\n`);
	}

	/**
	 * Start heartbeat to detect dead connections
	 */
	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			const now = Date.now();

			for (const [clientId, connection] of this.connections) {
				// Check if connection is dead
				const timeSinceLastHeartbeat = now - connection.lastHeartbeat;
				if (timeSinceLastHeartbeat > this.CONNECTION_TIMEOUT) {
					console.warn(`[SSE] Connection timeout for client ${clientId}, removing`);
					this.handleDisconnection(clientId);
					continue;
				}

				// Send heartbeat
				try {
					connection.reply.raw.write(':heartbeat\n\n');
					connection.lastHeartbeat = now;
				} catch (error) {
					console.error(`[SSE] Heartbeat failed for client ${clientId}:`, error);
					this.handleDisconnection(clientId);
				}
			}
		}, this.HEARTBEAT_INTERVAL);
	}

	/**
	 * Check if event data matches filters
	 */
	private matchesFilters(data: unknown, filters?: Record<string, unknown>): boolean {
		if (!filters || Object.keys(filters).length === 0) {
			return true;
		}

		const dataObj = data as Record<string, unknown>;
		return Object.entries(filters).every(([key, value]) => dataObj[key] === value);
	}

	/**
	 * Parse cookies from header
	 */
	private parseCookies(cookieHeader: string): Record<string, string> {
		const cookies: Record<string, string> = {};
		cookieHeader.split(';').forEach(cookie => {
			const [key, value] = cookie.trim().split('=');
			if (key && value) {
				cookies[key] = decodeURIComponent(value);
			}
		});
		return cookies;
	}

	/**
	 * Generate unique client ID
	 */
	private generateClientId(): string {
		return `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * Generate unique event ID
	 */
	private generateEventId(): string {
		return `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * Register client connected handler
	 */
	onClientConnected(handler: ClientConnectedHandler): void {
		this.connectHandlers.push(handler);
	}

	/**
	 * Register client disconnected handler
	 */
	onClientDisconnected(handler: ClientDisconnectedHandler): void {
		this.disconnectHandlers.push(handler);
	}

	/**
	 * Get all connected client IDs
	 */
	getConnectedClients(): string[] {
		return Array.from(this.connections.keys());
	}

	/**
	 * Shutdown SSE server
	 */
	shutdown(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}

		// Close all connections
		for (const [clientId, connection] of this.connections) {
			try {
				connection.reply.raw.end();
			} catch (error) {
				// Ignore errors during shutdown
			}
		}

		this.connections.clear();
		console.log('[SSE] Server shutdown complete');
	}
}
