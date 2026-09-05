/**
 * Transports Controller
 *
 * Unified subscription management API for all transport types (except WebSocket).
 * Provides RESTful endpoints for managing event subscriptions across SSE,
 * Long Polling, and HTTP Polling transports.
 *
 * Features:
 * - Batch subscribe/unsubscribe to multiple events
 * - Single event subscribe/unsubscribe
 * - Get current subscriptions
 * - Get transport status and queue info
 *
 * Authentication:
 * - Uses X-Conn-Id header for connection identification
 * - Validates session via TransportSessionManager
 *
 * WebSocket Exception:
 * - WebSocket uses message-based subscriptions (bidirectional)
 * - These REST endpoints are NOT used by WebSocket clients
 *
 * Production Requirement:
 * - All endpoints MUST start with /api/transports/*
 * - Required for reverse proxy routing
 *
 * @example
 * ```typescript
 * const controller = new TransportsController(sessionManager, messageQueue);
 * fastify.post('/api/transports/subscriptions', (req, reply) =>
 *   controller.batchSubscriptions(req, reply)
 * );
 * ```
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from 'shared-common/logger';

import type { MessageQueue } from '../transport/MessageQueue';
import type { TransportSessionManager } from '../transport/TransportSessionManager';

const log = createLogger('TransportsController');

/**
 * Batch subscription request body
 */
interface BatchSubscriptionRequest {
	/** Action to perform */
	action: 'subscribe' | 'unsubscribe';
	/** Event types to subscribe/unsubscribe */
	events: string[];
	/** Optional filters per event type */
	filters?: Record<string, Record<string, unknown>>;
}

/**
 * Single event subscription request body
 */
interface SingleSubscriptionRequest {
	/** Optional filters for the event */
	filters?: Record<string, unknown>;
}

/**
 * Subscription info
 */
interface SubscriptionInfo {
	/** Event type */
	event: string;
	/** Filters for this event */
	filters: Record<string, unknown>;
}

/**
 * Transports Controller
 *
 * Handles unified subscription management for all polling transports.
 */
export class TransportsController {
	constructor(
		private sessionManager: TransportSessionManager,
		private messageQueue: MessageQueue
	) {}

	/**
	 * POST /api/transports/subscriptions
	 *
	 * Batch subscribe or unsubscribe to multiple events.
	 *
	 * Request body:
	 * {
	 *   action: 'subscribe' | 'unsubscribe',
	 *   events: ['b2f:task:created', 'b2f:worker:*'],
	 *   filters: {
	 *     'b2f:task:created': { priority: 'high' }
	 *   }
	 * }
	 *
	 * Response:
	 * {
	 *   success: true,
	 *   subscribed: ['b2f:task:created', 'b2f:worker:*'],
	 *   filters: { ... }
	 * }
	 */
	async batchSubscriptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Get connId from header
			const connId = this.getConnIdFromHeader(request);
			if (!connId) {
				reply.code(400).send({ error: 'Missing connection ID', message: 'X-Conn-Id header required' });
				return;
			}

			// Validate session
			const session = this.sessionManager.getSession(connId);
			if (!session) {
				reply.code(401).send({ error: 'Not authenticated', message: 'No active session found' });
				return;
			}

			// Parse and validate request body
			const body = request.body as BatchSubscriptionRequest;
			if (!body || !body.action || !Array.isArray(body.events)) {
				reply.code(400).send({
					error: 'Invalid request',
					message: 'Request body must include action and events array',
				});
				return;
			}

			// Update subscriptions via session manager
			this.sessionManager.updateSubscriptions(connId, body.action, body.events, body.filters);

			// Get updated session to return current state
			const updatedSession = this.sessionManager.getSession(connId);
			if (!updatedSession) {
				reply.code(500).send({ error: 'Internal error', message: 'Session lost after update' });
				return;
			}

			log.info(
				`[TransportsController] ${body.action} for connection ${connId}: ${body.events.join(', ')} (user=${session.userId})`
			);

			// Return success with current subscriptions
			reply.send({
				success: true,
				subscribed: Array.from(updatedSession.subscribedEvents),
				filters: Object.fromEntries(updatedSession.eventFilters),
			});
		} catch (error) {
			log.error('Batch subscription failed:', error);
			reply.code(500).send({
				error: 'Internal server error',
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
			});
		}
	}

	/**
	 * POST /api/transports/subscriptions/:event
	 *
	 * Subscribe to a single event with optional filters.
	 *
	 * Request body:
	 * {
	 *   filters: { priority: 'high', status: 'pending' }
	 * }
	 *
	 * Response:
	 * {
	 *   success: true,
	 *   event: 'b2f:task:created',
	 *   filters: { priority: 'high' }
	 * }
	 */
	async subscribeToEvent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Get connId from header
			const connId = this.getConnIdFromHeader(request);
			if (!connId) {
				reply.code(400).send({ error: 'Missing connection ID', message: 'X-Conn-Id header required' });
				return;
			}

			// Validate session
			const session = this.sessionManager.getSession(connId);
			if (!session) {
				reply.code(401).send({ error: 'Not authenticated', message: 'No active session found' });
				return;
			}

			// Get event from params
			const params = request.params as { event: string };
			const event = params.event;
			if (!event) {
				reply.code(400).send({ error: 'Invalid request', message: 'Event parameter is required' });
				return;
			}

			// Parse request body (filters are optional)
			const body = (request.body as SingleSubscriptionRequest) || {};
			const filters = body.filters;

			// Subscribe to single event
			this.sessionManager.updateSubscriptions(
				connId,
				'subscribe',
				[event],
				filters ? { [event]: filters } : undefined
			);

			// Get updated session to return current state
			const updatedSession = this.sessionManager.getSession(connId);
			if (!updatedSession) {
				reply.code(500).send({ error: 'Internal error', message: 'Session lost after update' });
				return;
			}

			log.info(
				`[TransportsController] subscribe to ${event} for connection ${connId} (user=${session.userId}, filters=${JSON.stringify(filters || {})})`
			);

			// Return success with event and filters
			reply.send({
				success: true,
				event,
				filters: updatedSession.eventFilters.get(event) || {},
			});
		} catch (error) {
			log.error('Subscribe to event failed:', error);
			reply.code(500).send({
				error: 'Internal server error',
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
			});
		}
	}

	/**
	 * DELETE /api/transports/subscriptions/:event
	 *
	 * Unsubscribe from a single event.
	 *
	 * Response:
	 * {
	 *   success: true,
	 *   event: 'b2f:task:created',
	 *   unsubscribed: true
	 * }
	 */
	async unsubscribeFromEvent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Get connId from header
			const connId = this.getConnIdFromHeader(request);
			if (!connId) {
				reply.code(400).send({ error: 'Missing connection ID', message: 'X-Conn-Id header required' });
				return;
			}

			// Validate session
			const session = this.sessionManager.getSession(connId);
			if (!session) {
				reply.code(401).send({ error: 'Not authenticated', message: 'No active session found' });
				return;
			}

			// Get event from params
			const params = request.params as { event: string };
			const event = params.event;
			if (!event) {
				reply.code(400).send({ error: 'Invalid request', message: 'Event parameter is required' });
				return;
			}

			// Unsubscribe from single event
			this.sessionManager.updateSubscriptions(connId, 'unsubscribe', [event]);

			log.info(
				`[TransportsController] unsubscribe from ${event} for connection ${connId} (user=${session.userId})`
			);

			// Return success
			reply.send({
				success: true,
				event,
				unsubscribed: true,
			});
		} catch (error) {
			log.error('Unsubscribe from event failed:', error);
			reply.code(500).send({
				error: 'Internal server error',
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/transports/subscriptions
	 *
	 * Get current subscriptions for the client.
	 *
	 * Response:
	 * {
	 *   subscriptions: [
	 *     { event: 'b2f:task:created', filters: { priority: 'high' } },
	 *     { event: 'b2f:worker:*', filters: {} }
	 *   ],
	 *   transportType: 'sse' | 'long-polling' | 'http'
	 * }
	 */
	async getSubscriptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Get connId from header
			const connId = this.getConnIdFromHeader(request);
			if (!connId) {
				reply.code(400).send({ error: 'Missing connection ID', message: 'X-Conn-Id header required' });
				return;
			}

			// Validate session
			const session = this.sessionManager.getSession(connId);
			if (!session) {
				reply.code(401).send({ error: 'Not authenticated', message: 'No active session found' });
				return;
			}

			// Build subscriptions list
			const subscriptions: SubscriptionInfo[] = Array.from(session.subscribedEvents).map(event => ({
				event,
				filters: session.eventFilters.get(event) || {},
			}));

			// Return subscriptions and transport type
			reply.send({
				subscriptions,
				transportType: this.sessionManager.getTransportType(connId),
			});
		} catch (error) {
			log.error('Get subscriptions failed:', error);
			reply.code(500).send({
				error: 'Internal server error',
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
			});
		}
	}

	/**
	 * GET /api/transports/status
	 *
	 * Get transport status and connection info.
	 *
	 * Response:
	 * {
	 *   connId: 'sse-123',
	 *   userId: 'user-456',
	 *   transportType: 'sse',
	 *   connected: true,
	 *   authenticatedAt: 1703...,
	 *   lastActivity: 1703...,
	 *   subscriptions: ['b2f:task:*', 'b2f:worker:updated'],
	 *   queuedEvents: 3
	 * }
	 */
	async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
		try {
			// Get connId from header
			const connId = this.getConnIdFromHeader(request);
			if (!connId) {
				reply.code(400).send({ error: 'Missing connection ID', message: 'X-Conn-Id header required' });
				return;
			}

			// Validate session
			const session = this.sessionManager.getSession(connId);
			if (!session) {
				reply.code(401).send({ error: 'Not authenticated', message: 'No active session found' });
				return;
			}

			// Check queued events
			const queuedEvents = this.messageQueue.peek(connId);

			// Return status
			reply.send({
				connId: session.connId,
				userId: session.userId,
				transportType: this.sessionManager.getTransportType(connId),
				connected: true,
				createdAt: session.createdAt,
				lastActivity: session.lastActivity,
				subscriptions: Array.from(session.subscribedEvents),
				queuedEvents: queuedEvents.length,
			});
		} catch (error) {
			log.error('Get status failed:', error);
			reply.code(500).send({
				error: 'Internal server error',
				message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
			});
		}
	}

	/**
	 * Extract connection ID from X-Conn-Id header
	 *
	 * @param request - Fastify request
	 * @returns Connection ID or undefined
	 */
	private getConnIdFromHeader(request: FastifyRequest): string | undefined {
		const connId = request.headers['x-conn-id'];
		if (typeof connId === 'string') {
			return connId;
		}
		if (Array.isArray(connId) && connId.length > 0) {
			return connId[0];
		}
		return undefined;
	}
}
