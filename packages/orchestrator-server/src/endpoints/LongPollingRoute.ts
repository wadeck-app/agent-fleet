/**
 * ===========================================================================================
 * LONG-POLLING ROUTE - POLLING FOR EVENTS
 * ===========================================================================================
 *
 * Long-polling endpoint for O→B event streaming.
 * Used by REST+LongPolling transport (most compatible fallback).
 *
 * Endpoint:
 * - GET /orchestrator/poll?timeout=30&events=task.created,worker.status - Poll for events
 *
 * Protocol:
 * - Client sends GET request with timeout
 * - Server holds connection until events available or timeout
 * - Returns batch of events as JSON array
 * - Client immediately sends next poll request
 *
 * ===========================================================================================
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { OrchestratorEventBroadcaster } from '../OrchestratorEventBroadcaster.js';

/**
 * Event queue for a polling client
 */
interface PollClient {
	clientId: string;
	events: any[];
	resolve: ((events: any[]) => void) | null;
	timeout: NodeJS.Timeout | null;
}

// Map of polling clients
const pollClients = new Map<string, PollClient>();

/**
 * Register long-polling route
 *
 * @param app - Fastify instance
 * @param eventBroadcaster - Event broadcaster
 */
export function registerLongPollingRoute(
	app: FastifyInstance,
	eventBroadcaster: OrchestratorEventBroadcaster
): void {
	app.get('/orchestrator/poll', async (request: FastifyRequest, reply: FastifyReply) => {
		const query = request.query as { timeout?: string; events?: string; clientId?: string };
		const timeoutSeconds = parseInt(query.timeout || '30');
		const subscribedEvents = query.events ? query.events.split(',') : [];
		const clientId = query.clientId || generateClientId();

		console.log(`[LongPollingRoute] Poll request from client: ${clientId}`);

		// Get or create poll client
		let pollClient = pollClients.get(clientId);
		if (!pollClient) {
			pollClient = {
				clientId,
				events: [],
				resolve: null,
				timeout: null,
			};
			pollClients.set(clientId, pollClient);

			// Register with event broadcaster
			eventBroadcaster.registerClient(clientId, async (event) => {
				const client = pollClients.get(clientId);
				if (!client) return;

				// Add event to queue
				client.events.push(event);

				// If client is waiting, resolve immediately
				if (client.resolve) {
					const events = [...client.events];
					client.events = [];

					if (client.timeout) {
						clearTimeout(client.timeout);
						client.timeout = null;
					}

					client.resolve(events);
					client.resolve = null;
				}
			});

			// Subscribe to requested events
			if (subscribedEvents.length > 0) {
				eventBroadcaster.subscribe(clientId, subscribedEvents);
			}
		}

		// If events already queued, return immediately
		if (pollClient.events.length > 0) {
			const events = [...pollClient.events];
			pollClient.events = [];

			console.log(`[LongPollingRoute] Returning ${events.length} queued events to ${clientId}`);
			return reply.code(200).send({ events });
		}

		// Wait for events or timeout
		const events = await new Promise<any[]>((resolve) => {
			pollClient!.resolve = resolve;

			// Set timeout
			pollClient!.timeout = setTimeout(() => {
				pollClient!.resolve = null;
				pollClient!.timeout = null;
				resolve([]);
			}, timeoutSeconds * 1000);
		});

		console.log(`[LongPollingRoute] Returning ${events.length} events to ${clientId}`);
		return reply.code(200).send({ events });
	});

	// Cleanup endpoint (optional)
	app.delete('/orchestrator/poll/:clientId', async (request: FastifyRequest, reply: FastifyReply) => {
		const params = request.params as { clientId: string };
		const clientId = params.clientId;

		const pollClient = pollClients.get(clientId);
		if (pollClient) {
			if (pollClient.timeout) {
				clearTimeout(pollClient.timeout);
			}
			pollClients.delete(clientId);
			eventBroadcaster.unregisterClient(clientId);

			console.log(`[LongPollingRoute] Client cleanup: ${clientId}`);
		}

		return reply.code(200).send({ success: true });
	});

	console.log('[LongPollingRoute] Long-polling route registered at GET /orchestrator/poll');
}

/**
 * Generate unique client ID
 *
 * @returns Client ID
 */
function generateClientId(): string {
	return `poll-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
