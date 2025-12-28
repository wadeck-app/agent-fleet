/**
 * Long Polling Transport Server
 *
 * Server-side implementation for HTTP Long Polling with:
 * - Unidirectional events (Server → Client)
 * - Cookie-based authentication
 * - Connection held open until events available or timeout
 * - Message queue for offline event storage
 * - Subscription management via HTTP endpoints
 *
 * Long Polling Flow:
 * 1. Client sends GET /long-polling/events
 * 2. Server holds connection open
 * 3. Server responds when: (a) events available, or (b) timeout (30s)
 * 4. Client immediately sends next request (continuous polling)
 *
 * Anti-fragility:
 * - Each polling request is independent (stateless)
 * - Request failure doesn't affect other clients
 * - Automatic timeout prevents hanging connections
 * - Message queue ensures no event loss
 * - No persistent connections (unlike WebSocket/SSE)
 *
 * @example
 * ```typescript
 * const server = new LongPollingTransportServer(sessionManager, messageQueue);
 * await server.initialize(fastify);
 *
 * // Broadcast to all long polling clients (queued)
 * server.broadcast('b2f:task:created', task);
 * ```
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { EventData, EventType, TransportEvent } from '@app/shared/transport';

import type { ClientConnectedHandler, ClientDisconnectedHandler, ITransportServer } from '../ITransportServer';
import type { MessageQueue } from '../MessageQueue';
import type { TransportSessionManager } from '../TransportSessionManager';

/**
 * Pending Poll Request
 * Tracks a long polling request waiting for events
 */
interface PendingPoll {
	/** Connection ID */
	connId: string;
	/** User ID */
	userId: string;
	/** Fastify reply */
	reply: FastifyReply;
	/** Timeout timer */
	timeout: NodeJS.Timeout;
	/** Request received timestamp */
	receivedAt: number;
}

/**
 * Long Polling Response
 * Server response format for long polling
 */
interface LongPollingResponse {
	/** Events to deliver */
	events: TransportEvent[];
	/** Whether client is authenticated */
	authenticated: boolean;
	/** User ID */
	userId?: string;
	/** Token expiration timestamp */
	tokenExpiresAt?: number;
}

/**
 * Long Polling Transport Server
 *
 * Implements ITransportServer using HTTP Long Polling for
 * unidirectional event delivery.
 */
export class LongPollingTransportServer implements ITransportServer {
	/**
	 * Pending poll requests
	 * Map<connId, PendingPoll>
	 */
	private pendingPolls = new Map<string, PendingPoll>();

	/**
	 * Active connection sessions (tracked for getConnectedClients)
	 * Map<connId, lastPollTimestamp>
	 */
	private activeSessions = new Map<string, number>();

	/**
	 * Client connection handlers
	 */
	private connectHandlers: ClientConnectedHandler[] = [];

	/**
	 * Client disconnection handlers
	 */
	private disconnectHandlers: ClientDisconnectedHandler[] = [];

	/**
	 * Cleanup timer for inactive sessions
	 */
	private cleanupTimer: NodeJS.Timeout | null = null;

	/**
	 * Poll timeout in milliseconds
	 */
	private readonly POLL_TIMEOUT = 30000; // 30 seconds

	/**
	 * Session timeout (consider inactive if no poll for this long)
	 */
	private readonly SESSION_TIMEOUT = 60000; // 1 minute

	/**
	 * Cleanup interval
	 */
	private readonly CLEANUP_INTERVAL = 30000; // 30 seconds

	/**
	 * Create Long Polling Transport Server
	 *
	 * @param sessionManager - Session manager for authentication
	 * @param messageQueue - Message queue for event storage
	 */
	constructor(
		private sessionManager: TransportSessionManager,
		private messageQueue: MessageQueue
	) {}

	/**
	 * Initialize Long Polling server
	 * Registers polling endpoint with /api prefix
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// Long polling events endpoint (NEW with /api prefix)
		app.get('/api/transports/long-polling', async (request, reply) => {
			await this.handlePollRequest(request, reply);
		});

		// Backward compatibility redirect (temporary)
		app.get('/long-polling/events', async (request, reply) => {
			reply.code(308).redirect('/api/transports/long-polling');
		});

		// Start cleanup timer
		this.startCleanup();

		console.log('[LongPolling] Server initialized');
	}

	/**
	 * Handle long polling request
	 */
	private async handlePollRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		// Get connId from query parameter (sent by client)
		const connId = (request.query as { connId?: string }).connId;

		if (!connId) {
			reply.code(400).send({ error: 'Missing connId parameter' });
			return;
		}

		try {
			// Authenticate
			const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'long-polling');

			// Track active session
			const isNewSession = !this.activeSessions.has(connId);
			this.activeSessions.set(connId, Date.now());

			if (isNewSession) {
				console.log(
					`[LongPolling] New connection ${connId} (user=${session.userId}, total=${this.activeSessions.size})`
				);
				this.connectHandlers.forEach(handler => handler(connId));
			}

			// Check if there are queued events
			const queuedEvents = this.messageQueue.dequeue(connId);

			if (queuedEvents.length > 0) {
				// Immediate response with queued events
				console.log(`[LongPolling] Sending ${queuedEvents.length} queued events to connection ${connId}`);
				const response: LongPollingResponse = {
					events: queuedEvents,
					authenticated: true,
					userId: session.userId,
					tokenExpiresAt: session.tokenExpiresAt,
				};
				reply.send(response);
				return;
			}

			// No queued events, hold connection open
			const pending: PendingPoll = {
				connId,
				userId: session.userId,
				reply,
				timeout: setTimeout(() => {
					this.respondToPoll(connId, []);
				}, this.POLL_TIMEOUT),
				receivedAt: Date.now(),
			};

			this.pendingPolls.set(connId, pending);

			// If this is the first poll, send initial response
			if (isNewSession) {
				const response: LongPollingResponse = {
					events: [],
					authenticated: true,
					userId: session.userId,
					tokenExpiresAt: session.tokenExpiresAt,
				};
				reply.send(response);
				this.pendingPolls.delete(connId);
				clearTimeout(pending.timeout);
			}

			// Handle request abort
			request.raw.on('close', () => {
				const p = this.pendingPolls.get(connId);
				if (p) {
					clearTimeout(p.timeout);
					this.pendingPolls.delete(connId);

					// Send empty response if not already sent
					// This prevents leaving the connection with an incomplete HTTP response when it aborts
					try {
						if (!p.reply.sent) {
							const response: LongPollingResponse = {
								events: [],
								authenticated: true,
								userId: p.userId,
							};
							p.reply.send(response);
						}
					} catch (error) {
						// Connection already closed or response already sent, ignore
						// This is expected behavior when connection aborts
					}
				}
			});
		} catch (error) {
			console.error('[LongPolling] Authentication failed:', error);
			reply.code(401).send({
				error: 'Authentication failed',
				message: error instanceof Error ? error.message : 'Unauthorized',
			});
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
	 * Respond to pending poll with events
	 */
	private respondToPoll(connId: string, events: TransportEvent[]): void {
		const pending = this.pendingPolls.get(connId);
		if (!pending) return;

		clearTimeout(pending.timeout);
		this.pendingPolls.delete(connId);

		try {
			const response: LongPollingResponse = {
				events,
				authenticated: true,
				userId: pending.userId,
			};
			pending.reply.send(response);
		} catch (error) {
			console.error(`[LongPolling] Failed to respond to connection ${connId}:`, error);
		}
	}

	/**
	 * Broadcast event to all long polling connections
	 * Events are queued for delivery on next poll
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		const transportEvent: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

		let deliveredCount = 0;
		let queuedCount = 0;

		// Get all active connections
		for (const connId of this.activeSessions.keys()) {
			// Check if connection is subscribed
			if (!this.sessionManager.isSubscribed(connId, event)) {
				continue;
			}

			// Check filters
			if (!this.sessionManager.matchesFilters(connId, event, data)) {
				continue;
			}

			// Check if connection has pending poll
			const pending = this.pendingPolls.get(connId);
			if (pending) {
				// Deliver immediately
				this.respondToPoll(connId, [transportEvent]);
				deliveredCount++;
			} else {
				// Queue for next poll
				this.messageQueue.enqueue(connId, transportEvent);
				queuedCount++;
			}
		}

		if (deliveredCount > 0 || queuedCount > 0) {
			console.log(`[LongPolling] Broadcast ${event}: delivered=${deliveredCount}, queued=${queuedCount}`);
		}
	}

	/**
	 * Send event to specific connection
	 */
	sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>): void {
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

		// Check if connection has pending poll
		const pending = this.pendingPolls.get(connId);
		if (pending) {
			// Deliver immediately
			this.respondToPoll(connId, [transportEvent]);
		} else {
			// Queue for next poll
			this.messageQueue.enqueue(connId, transportEvent);
		}
	}

	/**
	 * Start cleanup of inactive sessions
	 */
	private startCleanup(): void {
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			const inactiveConnections: string[] = [];

			for (const [connId, lastPoll] of this.activeSessions) {
				const timeSinceLastPoll = now - lastPoll;
				if (timeSinceLastPoll > this.SESSION_TIMEOUT) {
					inactiveConnections.push(connId);
				}
			}

			for (const connId of inactiveConnections) {
				this.activeSessions.delete(connId);
				this.sessionManager.removeSession(connId);
				this.messageQueue.clearQueue(connId);

				console.log(`[LongPolling] Removed inactive connection ${connId}`);

				this.disconnectHandlers.forEach(handler => handler(connId));
			}

			if (inactiveConnections.length > 0) {
				console.log(
					`[LongPolling] Cleaned up ${inactiveConnections.length} inactive connections (active=${this.activeSessions.size})`
				);
			}
		}, this.CLEANUP_INTERVAL);
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
	 * Get all connected (active) connection IDs
	 */
	getConnectedClients(): string[] {
		return Array.from(this.activeSessions.keys());
	}

	/**
	 * Get transport type for this server
	 */
	getTransportType(): 'long-polling' {
		return 'long-polling';
	}

	/**
	 * Shutdown long polling server
	 */
	shutdown(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}

		// Cancel all pending polls
		for (const [connId, pending] of this.pendingPolls) {
			clearTimeout(pending.timeout);
			try {
				pending.reply.send({ events: [], authenticated: true });
			} catch (error) {
				// Ignore errors during shutdown
			}
		}

		this.pendingPolls.clear();
		this.activeSessions.clear();

		console.log('[LongPolling] Server shutdown complete');
	}
}
