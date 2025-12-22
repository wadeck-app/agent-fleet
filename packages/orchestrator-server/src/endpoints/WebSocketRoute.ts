/**
 * ===========================================================================================
 * WEBSOCKET ROUTE - BIDIRECTIONAL BACKEND-ORCHESTRATOR COMMUNICATION
 * ===========================================================================================
 *
 * WebSocket route for Backend ↔ Orchestrator communication.
 * Handles B→O requests and O→B event streaming.
 *
 * Protocol:
 * - Client → Server: { type: 'request', payload: B2ORequest }
 * - Server → Client: { type: 'response', payload: B2OResponse }
 * - Server → Client: { type: 'event', payload: O2BEvent }
 * - Client → Server: { type: 'subscribe', eventTypes: string[] }
 * - Client → Server: { type: 'unsubscribe', eventTypes: string[] }
 * - Client → Server: { type: 'ping' }
 * - Server → Client: { type: 'pong' }
 *
 * Features:
 * - Request/response correlation
 * - Event subscription management
 * - Heartbeat ping/pong
 * - Automatic client registration/cleanup
 *
 * ===========================================================================================
 */

import type { FastifyInstance } from 'fastify';

import type { OrchestratorEventBroadcaster } from '../OrchestratorEventBroadcaster.js';
import type { OrchestratorRequestHandler } from '../OrchestratorRequestHandler.js';

/**
 * WebSocket message types
 */
interface WSMessage {
	type: 'request' | 'response' | 'event' | 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
	payload?: unknown;
	eventTypes?: string[];
}

/**
 * Register WebSocket route
 *
 * @param app - Fastify instance
 * @param requestHandler - Request handler
 * @param eventBroadcaster - Event broadcaster
 */
export function registerWebSocketRoute(
	app: FastifyInstance,
	requestHandler: OrchestratorRequestHandler,
	eventBroadcaster: OrchestratorEventBroadcaster
): void {
	app.get('/orchestrator/ws', { websocket: true }, (connection: any, req) => {
		const ws = connection.socket;
		const clientId = generateClientId();

		console.log(`[WebSocketRoute] Client connected: ${clientId}`);

		// Register client for event broadcasting
		const client = eventBroadcaster.registerClient(clientId, async (event) => {
			const message: WSMessage = {
				type: 'event',
				payload: event,
			};

			ws.send(JSON.stringify(message));
		});

		// Handle incoming messages
		ws.on('message', async (data: Buffer) => {
			try {
				const message: WSMessage = JSON.parse(data.toString());

				switch (message.type) {
					case 'request':
						await handleRequest(message, ws, requestHandler);
						break;

					case 'subscribe':
						if (message.eventTypes) {
							eventBroadcaster.subscribe(clientId, message.eventTypes);
						}
						break;

					case 'unsubscribe':
						if (message.eventTypes) {
							eventBroadcaster.unsubscribe(clientId, message.eventTypes);
						}
						break;

					case 'ping':
						ws.send(JSON.stringify({ type: 'pong' }));
						break;

					default:
						console.warn('[WebSocketRoute] Unknown message type:', message.type);
				}
			} catch (error) {
				console.error('[WebSocketRoute] Error handling message:', error);
			}
		});

		// Handle connection close
		ws.on('close', () => {
			console.log(`[WebSocketRoute] Client disconnected: ${clientId}`);
			eventBroadcaster.unregisterClient(clientId);
		});

		// Handle errors
		ws.on('error', (error: Error) => {
			console.error(`[WebSocketRoute] WebSocket error for client ${clientId}:`, error);
		});
	});

	console.log('[WebSocketRoute] WebSocket route registered at /orchestrator/ws');
}

/**
 * Handle B→O request
 *
 * @param message - Incoming message
 * @param ws - WebSocket connection
 * @param requestHandler - Request handler
 */
async function handleRequest(
	message: WSMessage,
	ws: any,
	requestHandler: OrchestratorRequestHandler
): Promise<void> {
	const request = message.payload as any;

	// Process request
	const response = await requestHandler.handleRequest(request);

	// Send response
	const responseMessage: WSMessage = {
		type: 'response',
		payload: response,
	};

	ws.send(JSON.stringify(responseMessage));
}

/**
 * Generate unique client ID
 *
 * @returns Client ID
 */
function generateClientId(): string {
	return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
