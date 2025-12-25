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
	/** Client ID */
	clientId: string;
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
	 * Map<clientId, PendingPoll>
	 */
	private pendingPolls = new Map<string, PendingPoll>();

	/**
	 * Active client sessions (tracked for getConnectedClients)
	 * Map<clientId, lastPollTimestamp>
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
	 * Registers polling endpoint and subscription management
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// Long polling events endpoint
		app.get('/long-polling/events', async (request, reply) => {
			await this.handlePollRequest(request, reply);
		});

		// Subscription management endpoint
		app.post('/long-polling/subscription', async (request, reply) => {
			await this.handleSubscriptionUpdate(request, reply);
		});

		// Start cleanup timer
		this.startCleanup();

		console.log('[LongPolling] Server initialized');
	}

	/**
	 * Handle long polling request
	 */
	private async handlePollRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		// Get or create client ID from cookie
		const cookies = this.parseCookies(request.raw.headers.cookie || '');
		let clientId = cookies['client_id'];

		if (!clientId) {
			clientId = this.generateClientId();
			// Note: In production, you'd set this cookie properly
			reply.header('Set-Cookie', `client_id=${clientId}; HttpOnly; SameSite=Strict; Path=/`);
		}

		try {
			// Authenticate
			const session = await this.sessionManager.authenticateConnection(clientId, request.raw, 'long-polling');

			// Track active session
			const isNewSession = !this.activeSessions.has(clientId);
			this.activeSessions.set(clientId, Date.now());

			if (isNewSession) {
				console.log(
					`[LongPolling] New client ${clientId} (user=${session.userId}, total=${this.activeSessions.size})`
				);
				this.connectHandlers.forEach(handler => handler(clientId));
			}

			// Check if there are queued events
			const queuedEvents = this.messageQueue.dequeue(clientId);

			if (queuedEvents.length > 0) {
				// Immediate response with queued events
				console.log(`[LongPolling] Sending ${queuedEvents.length} queued events to client ${clientId}`);
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
				clientId,
				userId: session.userId,
				reply,
				timeout: setTimeout(() => {
					this.respondToPoll(clientId, []);
				}, this.POLL_TIMEOUT),
				receivedAt: Date.now(),
			};

			this.pendingPolls.set(clientId, pending);

			// If this is the first poll, send initial response
			if (isNewSession) {
				const response: LongPollingResponse = {
					events: [],
					authenticated: true,
					userId: session.userId,
					tokenExpiresAt: session.tokenExpiresAt,
				};
				reply.send(response);
				this.pendingPolls.delete(clientId);
				clearTimeout(pending.timeout);
			}

			// Handle request abort
			request.raw.on('close', () => {
				const p = this.pendingPolls.get(clientId);
				if (p) {
					clearTimeout(p.timeout);
					this.pendingPolls.delete(clientId);
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
	 */
	private async handleSubscriptionUpdate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Parse cookies for authentication
			const cookies = this.parseCookies(request.raw.headers.cookie || '');
			const accessToken = cookies['access_token'];
			const clientId = cookies['client_id'];

			// SECURITY: DEVELOPMENT ONLY - Bypass authentication if DISABLE_AUTH_DEV=true
			const disableAuthDev = process.env.DISABLE_AUTH_DEV === 'true';

			let userId: string;

			if (disableAuthDev && !accessToken && clientId) {
				// Mode DEV: pas d'auth, use mock user
				userId = 'dev-user-no-auth';
				console.log('[LongPolling] DEV MODE: Subscription without auth (user=dev-user-no-auth)');
			} else if (!accessToken || !clientId) {
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

			// Update subscriptions
			const session = this.sessionManager['sessions'].get(clientId);
			if (!session) {
				reply.code(404).send({ error: 'No active session found' });
				return;
			}

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

			console.log(
				`[LongPolling] ${body.action} for client ${clientId} (user=${userId}): ${body.events.join(', ')}`
			);

			reply.send({ success: true });
		} catch (error) {
			console.error('[LongPolling] Subscription update failed:', error);
			reply.code(500).send({ error: 'Internal server error' });
		}
	}

	/**
	 * Respond to pending poll with events
	 */
	private respondToPoll(clientId: string, events: TransportEvent[]): void {
		const pending = this.pendingPolls.get(clientId);
		if (!pending) return;

		clearTimeout(pending.timeout);
		this.pendingPolls.delete(clientId);

		try {
			const response: LongPollingResponse = {
				events,
				authenticated: true,
				userId: pending.userId,
			};
			pending.reply.send(response);
		} catch (error) {
			console.error(`[LongPolling] Failed to respond to client ${clientId}:`, error);
		}
	}

	/**
	 * Broadcast event to all long polling clients
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

		// Get all active clients
		for (const clientId of this.activeSessions.keys()) {
			// Check if client is subscribed
			const session = this.sessionManager['sessions'].get(clientId);
			if (!session || !session.subscribedEvents.has(event)) {
				continue;
			}

			// Check filters
			if (!this.matchesFilters(data, session.eventFilters.get(event))) {
				continue;
			}

			// Check if client has pending poll
			const pending = this.pendingPolls.get(clientId);
			if (pending) {
				// Deliver immediately
				this.respondToPoll(clientId, [transportEvent]);
				deliveredCount++;
			} else {
				// Queue for next poll
				this.messageQueue.enqueue(clientId, transportEvent);
				queuedCount++;
			}
		}

		if (deliveredCount > 0 || queuedCount > 0) {
			console.log(`[LongPolling] Broadcast ${event}: delivered=${deliveredCount}, queued=${queuedCount}`);
		}
	}

	/**
	 * Send event to specific client
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
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

		// Check if client has pending poll
		const pending = this.pendingPolls.get(clientId);
		if (pending) {
			// Deliver immediately
			this.respondToPoll(clientId, [transportEvent]);
		} else {
			// Queue for next poll
			this.messageQueue.enqueue(clientId, transportEvent);
		}
	}

	/**
	 * Start cleanup of inactive sessions
	 */
	private startCleanup(): void {
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			const inactiveSessions: string[] = [];

			for (const [clientId, lastPoll] of this.activeSessions) {
				const timeSinceLastPoll = now - lastPoll;
				if (timeSinceLastPoll > this.SESSION_TIMEOUT) {
					inactiveSessions.push(clientId);
				}
			}

			for (const clientId of inactiveSessions) {
				this.activeSessions.delete(clientId);
				this.sessionManager.removeSession(clientId);
				this.messageQueue.clearQueue(clientId);

				console.log(`[LongPolling] Removed inactive session ${clientId}`);

				this.disconnectHandlers.forEach(handler => handler(clientId));
			}

			if (inactiveSessions.length > 0) {
				console.log(
					`[LongPolling] Cleaned up ${inactiveSessions.length} inactive sessions (active=${this.activeSessions.size})`
				);
			}
		}, this.CLEANUP_INTERVAL);
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
		return `lp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
	 * Get all connected (active) client IDs
	 */
	getConnectedClients(): string[] {
		return Array.from(this.activeSessions.keys());
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
		for (const [clientId, pending] of this.pendingPolls) {
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
