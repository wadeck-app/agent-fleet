/**
 * HTTP Polling Transport Server (Short Polling)
 *
 * Server-side implementation for HTTP short polling with:
 * - Unidirectional events (Server → Client)
 * - Cookie-based authentication
 * - Immediate response (no connection hold, unlike long polling)
 * - Message queue for all event delivery
 * - Subscription management via unified REST endpoints
 *
 * HTTP Polling Flow:
 * 1. Client sends GET /api/transports/http-polling
 * 2. Server responds IMMEDIATELY with any queued events
 * 3. Client waits 5-10s, then sends next request (polling interval)
 *
 * Key Differences from Long Polling:
 * - No connection hold (immediate response)
 * - No timeout mechanism (30s)
 * - No pendingPolls tracking
 * - Simpler implementation
 * - Client controls polling interval
 *
 * Anti-fragility:
 * - Each polling request is independent (stateless)
 * - Request failure doesn't affect other clients
 * - No persistent connections
 * - Message queue ensures no event loss
 * - Simple implementation = fewer failure modes
 *
 * @example
 * ```typescript
 * const server = new HttpPollingTransportServer(sessionManager, messageQueue);
 * await server.initialize(fastify);
 *
 * // Broadcast to all HTTP polling clients (queued)
 * server.broadcast('b2f:task:created', task);
 * ```
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from 'shared-common/logger';

import type { EventData, EventType, TransportEvent } from '@app/shared/transport';

import type { ClientConnectedHandler, ClientDisconnectedHandler, ITransportServer } from '../ITransportServer';
import type { MessageQueue } from '../MessageQueue';
import type { TransportSessionManager } from '../TransportSessionManager';

const log = createLogger('HttpPollingTransportServer');

/**
 * HTTP Polling Response
 * Server response format for HTTP polling
 */
interface HttpPollingResponse {
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
 * HTTP Polling Transport Server
 *
 * Implements ITransportServer using HTTP short polling for
 * unidirectional event delivery.
 */
export class HttpPollingTransportServer implements ITransportServer {
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
	 * Session timeout (consider inactive if no poll for this long)
	 */
	private readonly SESSION_TIMEOUT = 60000; // 1 minute

	/**
	 * Cleanup interval
	 */
	private readonly CLEANUP_INTERVAL = 30000; // 30 seconds

	/**
	 * Create HTTP Polling Transport Server
	 *
	 * @param sessionManager - Session manager for authentication
	 * @param messageQueue - Message queue for event storage
	 */
	constructor(
		private sessionManager: TransportSessionManager,
		private messageQueue: MessageQueue
	) {}

	/**
	 * Initialize HTTP Polling server
	 * Registers polling endpoint
	 */
	async initialize(app: FastifyInstance): Promise<void> {
		// HTTP polling events endpoint
		app.get('/api/transports/http-polling', async (request, reply) => {
			await this.handlePollRequest(request, reply);
		});

		// Start cleanup timer
		this.startCleanup();

		log.info('Server initialized');
	}

	/**
	 * Handle HTTP polling request
	 *
	 * Returns immediately with any queued events.
	 * If no events are queued, returns empty array.
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
			const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'http');

			// Track active session
			const isNewSession = !this.activeSessions.has(connId);
			this.activeSessions.set(connId, Date.now());

			if (isNewSession) {
				log.info(
					`[HttpPolling] New connection ${connId} (user=${session.userId}, total=${this.activeSessions.size})`
				);
				this.connectHandlers.forEach(handler => handler(connId));
			}

			// Dequeue ALL pending events (immediate response)
			const queuedEvents = this.messageQueue.dequeue(connId);

			if (queuedEvents.length > 0) {
				log.info(`Sending ${queuedEvents.length} queued events to connection ${connId}`);
			}

			// Always respond immediately (no waiting)
			const response: HttpPollingResponse = {
				events: queuedEvents,
				authenticated: true,
				userId: session.userId,
				tokenExpiresAt: session.tokenExpiresAt,
			};

			reply.send(response);
		} catch (error) {
			log.error('Authentication failed:', error);
			reply.code(401).send({
				error: 'Authentication failed',
				message: error instanceof Error ? error.message : 'Unauthorized',
			});
		}
	}

	/**
	 * Broadcast event to all HTTP polling connections
	 * Events are ALWAYS queued for delivery on next poll
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		const transportEvent: TransportEvent = {
			id: this.generateEventId(),
			type: event,
			data,
			timestamp: Date.now(),
		};

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

			// ALWAYS queue (no direct delivery for HTTP polling)
			this.messageQueue.enqueue(connId, transportEvent);
			queuedCount++;
		}

		if (queuedCount > 0) {
			log.info(`Broadcast ${event}: queued=${queuedCount}`);
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

		// ALWAYS queue (no direct delivery for HTTP polling)
		this.messageQueue.enqueue(connId, transportEvent);
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
					`[HttpPolling] Cleaned up ${inactiveConnections.length} inactive connections (active=${this.activeSessions.size})`
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
	getTransportType(): 'http' {
		return 'http';
	}

	/**
	 * Shutdown HTTP polling server
	 */
	shutdown(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}

		this.activeSessions.clear();

		log.info('Server shutdown complete');
	}
}
