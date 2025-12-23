/**
 * ===========================================================================================
 * SSE ROUTE - SERVER-SENT EVENTS
 * ===========================================================================================
 *
 * Server-Sent Events endpoint for O→B event streaming.
 * Used by REST+SSE transport.
 *
 * Endpoint:
 * - GET /orchestrator/events?events=task.created,worker.status - Stream O→B events
 *
 * Protocol:
 * - Each event sent as SSE data field with JSON payload
 * - Supports event filtering via query params
 *
 * ===========================================================================================
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { OrchestratorEventBroadcaster } from '../OrchestratorEventBroadcaster.js';

/**
 * Register SSE route
 *
 * @param app - Fastify instance
 * @param eventBroadcaster - Event broadcaster
 */
export function registerSseRoute(app: FastifyInstance, eventBroadcaster: OrchestratorEventBroadcaster): void {
	app.get('/orchestrator/events', async (request: FastifyRequest, reply: FastifyReply) => {
		const clientId = generateClientId();

		console.log(`[SseRoute] SSE client connected: ${clientId}`);

		// Set SSE headers
		reply.raw.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});

		// Parse subscribed events from query params
		const query = request.query as { events?: string };
		const subscribedEvents = query.events ? query.events.split(',') : [];

		// Register client
		const client = eventBroadcaster.registerClient(clientId, async event => {
			// Send event as SSE
			const data = JSON.stringify(event);
			reply.raw.write(`data: ${data}\n\n`);
		});

		// Subscribe to requested events
		if (subscribedEvents.length > 0) {
			eventBroadcaster.subscribe(clientId, subscribedEvents);
		}

		// Send initial connection success event
		reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

		// Handle client disconnect
		request.raw.on('close', () => {
			console.log(`[SseRoute] SSE client disconnected: ${clientId}`);
			eventBroadcaster.unregisterClient(clientId);
		});

		// Keep connection alive with periodic comments
		const keepAliveInterval = setInterval(() => {
			reply.raw.write(': keepalive\n\n');
		}, 30000);

		request.raw.on('close', () => {
			clearInterval(keepAliveInterval);
		});
	});

	console.log('[SseRoute] SSE route registered at GET /orchestrator/events');
}

/**
 * Generate unique client ID
 *
 * @returns Client ID
 */
function generateClientId(): string {
	return `sse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
