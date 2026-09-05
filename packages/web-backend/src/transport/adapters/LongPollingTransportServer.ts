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
import { createLogger } from 'shared-common/logger';

import type { EventData, EventType, TransportEvent } from '@app/shared/transport';

import type { ClientConnectedHandler, ClientDisconnectedHandler, ITransportServer } from '../ITransportServer';
import type { MessageQueue } from '../MessageQueue';
import type { TransportSessionManager } from '../TransportSessionManager';

const log = createLogger('LongPollingTransportServer');

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

		log.info('Server initialized');
	}

	/**
	 * Handle long polling request
	 */
	private async handlePollRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		// Get connId and firstPoll flag from query parameters (sent by client)
		const query = request.query as { connId?: string; firstPoll?: string };
		const connId = query.connId;
		const isFirstPoll = query.firstPoll === 'true';

		log.info(`Poll request received for connId: ${connId}, firstPoll: ${isFirstPoll}`);

		if (!connId) {
			reply.code(400).send({ error: 'Missing connId parameter' });
			return;
		}

		// Handle request abort FIRST (before any processing)
		// This ensures we detect client aborts even during initial response
		let aborted = false;
		const abortedAt = { time: 0 };
		const requestStartTime = Date.now();
		request.raw.on('close', () => {
			aborted = true;
			abortedAt.time = Date.now();
			const elapsedMs = abortedAt.time - requestStartTime;
			const p = this.pendingPolls.get(connId);
			if (p) {
				clearTimeout(p.timeout);
				this.pendingPolls.delete(connId);
				log.info(`[LongPolling] DEBUG: Connection ${connId} closed, had pending poll (elapsed=${elapsedMs}ms)`);
			} else {
				log.info(`[LongPolling] DEBUG: Connection ${connId} closed, no pending poll (elapsed=${elapsedMs}ms)`);
			}
			log.info(
				`[LongPolling] DEBUG: Request complete:${request.raw.complete}, Response ended:${reply.raw.writableEnded}`
			);
		});

		try {
			// Authenticate
			const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'long-polling');

			// Track active session and detect new sessions vs reconnections
			const isNewSession = !this.activeSessions.has(connId);
			// @formatter:off
			// Client sends firstPoll=true on first poll after connect/reconnect
			// This ensures immediate response even after page refresh with same connId
			// @formatter:on
			const shouldSendImmediateResponse = isNewSession || isFirstPoll;

			this.activeSessions.set(connId, Date.now());

			if (isNewSession) {
				log.info(
					`[LongPolling] New connection ${connId} (user=${session.userId}, total=${this.activeSessions.size})`
				);
				this.connectHandlers.forEach(handler => handler(connId));
			}

			if (shouldSendImmediateResponse) {
				// Queue initial response instead of sending it immediately
				// This avoids race condition with React StrictMode double-mount
				// where the first request gets aborted before the response is fully received
				const eventType = isNewSession ? '__initial_response__' : '__keep_alive__';
				const responseEvent: TransportEvent = {
					id: this.generateEventId(),
					type: eventType as any,
					data: {
						authenticated: true,
						userId: session.userId,
						tokenExpiresAt: session.tokenExpiresAt,
					},
					timestamp: Date.now(),
				};
				this.messageQueue.enqueue(connId, responseEvent);
				log.info(
					`[LongPolling] Queued ${eventType} for ${isNewSession ? 'new session' : 'reconnection'} ${connId}`
				);
			}

			// Check if connection was aborted during authentication
			if (aborted) {
				log.info(`Connection ${connId} aborted during authentication`);
				return;
			}

			// Check if there are queued events
			const queuedEvents = this.messageQueue.dequeue(connId);
			log.info(`[LongPolling] DEBUG: Dequeued ${queuedEvents.length} events for ${connId}, aborted=${aborted}`);

			if (queuedEvents.length > 0) {
				// Check if aborted before sending
				if (aborted) {
					log.info(`Connection ${connId} aborted before sending queued events`);
					return;
				}

				// Filter out special marker events (don't send them to client)
				const filteredEvents = queuedEvents.filter(
					e => e.type !== '__initial_response__' && e.type !== '__keep_alive__'
				);

				// Immediate response with queued events
				log.info(
					`[LongPolling] Sending ${filteredEvents.length} queued events to connection ${connId} (${queuedEvents.length - filteredEvents.length} filtered)`
				);
				const response: LongPollingResponse = {
					events: filteredEvents,
					authenticated: true,
					userId: session.userId,
					tokenExpiresAt: session.tokenExpiresAt,
				};
				reply.header('Content-Type', 'application/json').send(response);
				return;
			}

			// No queued events, hold connection open
			log.info(`DEBUG: No queued events, adding to pendingPolls for ${connId}`);

			// Check if there's already a pending poll for this connId (e.g., from a page refresh)
			// If so, terminate it immediately to avoid making the new request wait
			const existingPoll = this.pendingPolls.get(connId);
			if (existingPoll) {
				log.info(`DEBUG: Replacing existing pending poll for ${connId} (rapid reconnect)`);
				clearTimeout(existingPoll.timeout);
				this.pendingPolls.delete(connId);
				try {
					// Send empty response to old poll
					this.sendHijackedResponse(existingPoll.reply, {
						events: [],
						authenticated: true,
						userId: existingPoll.userId,
					});
				} catch (error) {
					// Ignore errors (old connection might already be closed)
					log.info(`DEBUG: Failed to close old poll (likely already closed):`, error);
				}
			}

			// CRITICAL: Tell Fastify we're manually managing this response
			// Without hijack(), Fastify will auto-send an empty 200 when the async handler returns
			reply.hijack();

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
			log.info(
				`[LongPolling] DEBUG: Added to pendingPolls, total pending=${this.pendingPolls.size}, response hijacked`
			);

			// Note: Request abort is already handled by the 'close' listener attached at the start of handlePollRequest
		} catch (error) {
			log.error('Authentication failed:', error);
			reply.code(401).send({
				error: 'Authentication failed',
				message: error instanceof Error ? String(error) : 'Unauthorized',
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
	 * Send a hijacked response with proper CORS headers
	 *
	 * When using reply.hijack(), Fastify doesn't add CORS headers automatically.
	 * This helper ensures CORS headers are always included.
	 */
	private sendHijackedResponse(reply: FastifyReply, data: unknown): void {
		const responseBody = JSON.stringify(data);
		reply.raw.writeHead(200, {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(responseBody),
			// CORS headers (must be added manually when using hijack)
			'Access-Control-Allow-Origin': reply.raw.req.headers.origin || '*',
			'Access-Control-Allow-Credentials': 'true',
		});
		reply.raw.write(responseBody);
		reply.raw.end();
	}

	/**
	 * Respond to pending poll with events
	 */
	private respondToPoll(connId: string, events: TransportEvent[]): void {
		log.info(`DEBUG: respondToPoll called for ${connId} with ${events.length} events`);
		const pending = this.pendingPolls.get(connId);
		if (!pending) {
			log.info(`Cannot respond to ${connId}: no pending poll found`);
			return;
		}

		clearTimeout(pending.timeout);
		this.pendingPolls.delete(connId);

		try {
			// Get session to include tokenExpiresAt
			const session = this.sessionManager.getSession(connId);

			const response: LongPollingResponse = {
				events,
				authenticated: true,
				userId: pending.userId,
				tokenExpiresAt: session?.tokenExpiresAt,
			};
			log.info(`Responding to poll ${connId} with ${events.length} events`);
			log.info(`DEBUG: About to send response:`, JSON.stringify(response).substring(0, 200));

			// Send response using helper (includes CORS headers)
			this.sendHijackedResponse(pending.reply, response);

			log.info(`DEBUG: Response sent for ${connId}`);
		} catch (error) {
			log.error(`Failed to respond to connection ${connId}:`, error);
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
			log.info(`Broadcast ${event}: delivered=${deliveredCount}, queued=${queuedCount}`);
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

				log.info(`Removed inactive connection ${connId}`);

				this.disconnectHandlers.forEach(handler => handler(connId));
			}

			if (inactiveConnections.length > 0) {
				log.info(
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
				// Send empty response using helper (includes CORS headers)
				this.sendHijackedResponse(pending.reply, { events: [], authenticated: true });
			} catch (error) {
				// Ignore errors during shutdown
			}
		}

		this.pendingPolls.clear();
		this.activeSessions.clear();

		log.info('Server shutdown complete');
	}
}
