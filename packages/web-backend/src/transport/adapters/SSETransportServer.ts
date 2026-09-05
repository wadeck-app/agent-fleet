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
import { createLogger } from 'shared-common/logger';

import type { EventData, EventType, TransportEvent } from '@app/shared/transport';

import type { ClientConnectedHandler, ClientDisconnectedHandler, ITransportServer } from '../ITransportServer';
import type { MessageQueue } from '../MessageQueue';
import type { TransportSessionManager } from '../TransportSessionManager';

const log = createLogger('SSETransportServer');

/**
 * SSE Connection
 * Tracks an active SSE connection with its reply stream
 */
interface SSEConnection {
	/** Connection ID */
	connId: string;
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
	 * Map<connId, SSEConnection>
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
	 * Registers SSE endpoint with /api prefix
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// SSE events endpoint (NEW with /api prefix)
		app.get('/api/transports/sse', async (request, reply) => {
			await this.handleSSEConnection(request, reply);
		});

		// // Backward compatibility redirect (temporary)
		// app.get('/sse', async (request, reply) => {
		// 	reply.code(308).redirect('/api/transports/sse');
		// });

		// Start heartbeat
		this.startHeartbeat();

		log.info('Server initialized');
	}

	/**
	 * Handle SSE connection
	 */
	private async handleSSEConnection(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		// Get connId from query parameter (sent by client)
		const connId = (request.query as { connId?: string }).connId;

		if (!connId) {
			reply.code(400).send({ error: 'Missing connId parameter' });
			return;
		}

		// Check for existing connection (rapid reconnect scenario)
		// This can happen with React StrictMode or network issues causing rapid reconnects
		const existingConnection = this.connections.get(connId);
		if (existingConnection) {
			log.warn(
				`Replacing existing connection ${connId.substring(0, 8)}... (rapid reconnect detected, closing orphaned stream)`
			);

			// Clean up orphaned connection to prevent memory leaks
			try {
				existingConnection.reply.raw.end();
				log.info(`Closed orphaned connection stream for ${connId.substring(0, 8)}...`);
			} catch (error) {
				log.error(`Failed to close orphaned connection ${connId.substring(0, 8)}...:`, error);
			}
		}

		try {
			// Authenticate connection (preserves subscriptions if reconnecting)
			const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'sse');

			// Setup SSE headers
			// CORS headers must be manually added when using reply.raw.writeHead()
			// as it bypasses Fastify's CORS plugin
			reply.raw.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no', // Disable nginx buffering
				'Access-Control-Allow-Origin': request.headers.origin || '*',
				'Access-Control-Allow-Credentials': 'true',
			});

			// Create connection
			const connection: SSEConnection = {
				connId,
				userId: session.userId,
				reply,
				lastHeartbeat: Date.now(),
				connectedAt: Date.now(),
			};

			this.connections.set(connId, connection);

			log.info(`[SSE] Connection ${connId} connected (user=${session.userId}, total=${this.connections.size})`);

			// Send initial connected event with auth info (NO connId - client already has it)
			this.sendSSEEvent(reply, 'connected', {
				userId: session.userId,
				tokenExpiresAt: session.tokenExpiresAt,
			});

			// Send any queued messages
			const queuedEvents = this.messageQueue.dequeue(connId);
			if (queuedEvents.length > 0) {
				log.info(`Sending ${queuedEvents.length} queued events to connection ${connId}`);
				for (const event of queuedEvents) {
					this.sendSSEEvent(reply, 'message', event);
				}
			}

			// Notify connection handlers
			this.connectHandlers.forEach(handler => handler(connId));

			// Handle connection close
			request.raw.on('close', () => {
				this.handleDisconnection(connId);
			});

			// Keep connection alive
			reply.raw.on('error', error => {
				log.error(`Connection error for ${connId}:`, error);
				this.handleDisconnection(connId);
			});
		} catch (error) {
			log.error('Authentication failed:', error);

			// Send auth error and close
			// CORS headers must be manually added when using reply.raw.writeHead()
			reply.raw.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Access-Control-Allow-Origin': request.headers.origin || '*',
				'Access-Control-Allow-Credentials': 'true',
			});

			this.sendSSEEvent(reply, 'auth_error', {
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Authentication failed',
			});

			reply.raw.end();
		}
	}

	/**
	 * Handle subscription update (subscribe/unsubscribe)
	 *
	 * DEPRECATED: Subscription management now handled by TransportsController
	 * at /api/transports/subscriptions. This method is kept for backward
	 * compatibility but should be removed in future versions.
	 */
	private async handleSubscriptionUpdate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		// Redirect to unified subscription endpoint
		reply.code(410).send({
			error: 'Endpoint deprecated',
			message: 'Subscription management moved to /api/transports/subscriptions',
			newEndpoint: '/api/transports/subscriptions',
		});
	}

	/**
	 * Handle connection disconnection
	 */
	private handleDisconnection(connId: string): void {
		const connection = this.connections.get(connId);
		if (!connection) return;

		this.connections.delete(connId);
		this.sessionManager.removeSession(connId);

		log.info(`[SSE] Connection ${connId} disconnected (user=${connection.userId}, total=${this.connections.size})`);

		// Notify disconnection handlers
		this.disconnectHandlers.forEach(handler => handler(connId));
	}

	/**
	 * Broadcast event to all SSE connections
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

		for (const [connId, connection] of this.connections) {
			// Check if connection is subscribed
			if (!this.sessionManager.isSubscribed(connId, event)) {
				continue;
			}

			// Check filters
			if (!this.sessionManager.matchesFilters(connId, event, data)) {
				continue;
			}

			try {
				this.sendSSEEvent(connection.reply, 'message', transportEvent);
				sentCount++;
			} catch (error) {
				log.error(`Failed to send to connection ${connId}:`, error);
				// Queue for later delivery
				this.messageQueue.enqueue(connId, transportEvent);
				queuedCount++;
			}
		}

		if (sentCount > 0 || queuedCount > 0) {
			log.info(`Broadcast ${event}: sent=${sentCount}, queued=${queuedCount}`);
		}
	}

	/**
	 * Send event to specific connection
	 */
	sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>): void {
		const connection = this.connections.get(connId);
		if (!connection) {
			// Connection not active, queue the message
			const transportEvent: TransportEvent = {
				id: this.generateEventId(),
				type: event,
				data,
				timestamp: Date.now(),
			};
			this.messageQueue.enqueue(connId, transportEvent);
			log.info(`Queued event ${event} for offline connection ${connId}`);
			return;
		}

		// Check if connection is subscribed
		if (!this.sessionManager.isSubscribed(connId, event)) {
			return;
		}

		// Check filters
		if (!this.sessionManager.matchesFilters(connId, event, data)) {
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
			log.error(`Failed to send to connection ${connId}:`, error);
			this.messageQueue.enqueue(connId, transportEvent);
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

			for (const [connId, connection] of this.connections) {
				// Check if connection is dead
				const timeSinceLastHeartbeat = now - connection.lastHeartbeat;
				if (timeSinceLastHeartbeat > this.CONNECTION_TIMEOUT) {
					log.warn(`Connection timeout for ${connId}, removing`);
					this.handleDisconnection(connId);
					continue;
				}

				// Send heartbeat
				try {
					connection.reply.raw.write(':heartbeat\n\n');
					connection.lastHeartbeat = now;
				} catch (error) {
					log.error(`Heartbeat failed for ${connId}:`, error);
					this.handleDisconnection(connId);
				}
			}
		}, this.HEARTBEAT_INTERVAL);
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
	 * Get all connected connection IDs
	 */
	getConnectedClients(): string[] {
		return Array.from(this.connections.keys());
	}

	/**
	 * Get transport type for this server
	 */
	getTransportType(): 'sse' {
		return 'sse';
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
		for (const [connId, connection] of this.connections) {
			try {
				connection.reply.raw.end();
			} catch (error) {
				// Ignore errors during shutdown
			}
		}

		this.connections.clear();
		log.info('Server shutdown complete');
	}
}
