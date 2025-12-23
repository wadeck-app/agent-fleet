/**
 * ===========================================================================================
 * ORCHESTRATOR SERVER - MAIN ENTRY POINT
 * ===========================================================================================
 *
 * Standalone server that exposes orchestrator functionality via HTTP/WebSocket.
 * Enables remote backend connections to orchestrator.
 *
 * Features:
 * - WebSocket endpoint for bidirectional communication
 * - REST endpoints for HTTP-based transports
 * - SSE endpoint for event streaming
 * - Long-polling endpoint for maximum compatibility
 * - CORS support for web clients
 * - Automatic orchestrator lifecycle management
 *
 * Architecture:
 * Backend (RemoteAdapter) → [HTTP/WS] → OrchestratorServer → Orchestrator
 *
 * Endpoints:
 * - GET /orchestrator/ws - WebSocket (bidirectional)
 * - POST /orchestrator/request - REST requests
 * - GET /orchestrator/events - SSE event stream
 * - GET /orchestrator/poll - Long-polling events
 *
 * Environment Variables:
 * - ORCHESTRATOR_SERVER_PORT: HTTP server port (default: 3737)
 * - ORCHESTRATOR_WS_PORT: Orchestrator's internal WS port (default: 3738)
 * - ORCHESTRATOR_REST_PORT: Orchestrator's internal REST port (default: 3737)
 *
 * ===========================================================================================
 */
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import Fastify from 'fastify';

import { Orchestrator } from '../core/index.js';
import { OrchestratorEventBroadcaster } from './OrchestratorEventBroadcaster.js';
import { OrchestratorRequestHandler } from './OrchestratorRequestHandler.js';
import { registerLongPollingRoute } from './endpoints/LongPollingRoute.js';
import { registerRestRoute } from './endpoints/RestRoute.js';
import { registerSseRoute } from './endpoints/SseRoute.js';
import { registerWebSocketRoute } from './endpoints/WebSocketRoute.js';

// Load environment variables
dotenv.config();

/**
 * Main server function
 */
async function main() {
	console.log('[OrchestratorServer] Starting orchestrator server...');

	// Parse configuration
	const serverPort = parseInt(process.env.ORCHESTRATOR_SERVER_PORT || '3737');
	const orchestratorWsPort = parseInt(process.env.ORCHESTRATOR_WS_PORT || '3738');
	const orchestratorRestPort = parseInt(process.env.ORCHESTRATOR_REST_PORT || '3737');

	// Create and start orchestrator
	const orchestrator = new Orchestrator({
		wsPort: orchestratorWsPort,
		restPort: orchestratorRestPort,
	});

	await orchestrator.start();
	console.log('[OrchestratorServer] Orchestrator started');

	// Create request handler and event broadcaster
	const requestHandler = new OrchestratorRequestHandler(orchestrator);
	const eventBroadcaster = new OrchestratorEventBroadcaster(orchestrator);

	// Create Fastify app
	const app = Fastify({
		logger: {
			level: 'info',
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					ignore: 'pid,hostname',
					translateTime: 'HH:MM:ss',
				},
			},
		},
	});

	// Register plugins
	await app.register(cors, {
		origin: true, // Allow all origins (adjust for production)
	});

	await app.register(fastifyWebsocket);

	// Register routes
	registerWebSocketRoute(app, requestHandler, eventBroadcaster);
	registerRestRoute(app, requestHandler);
	registerSseRoute(app, eventBroadcaster);
	registerLongPollingRoute(app, eventBroadcaster);

	// Health check endpoint
	app.get('/health', async () => {
		return {
			status: 'ok',
			orchestrator: {
				wsPort: orchestratorWsPort,
				restPort: orchestratorRestPort,
			},
			clients: eventBroadcaster.getClientCount(),
		};
	});

	// Start server
	try {
		await app.listen({ port: serverPort, host: '0.0.0.0' });
		console.log(`[OrchestratorServer] Server listening on port ${serverPort}`);
		console.log(`[OrchestratorServer] WebSocket: ws://localhost:${serverPort}/orchestrator/ws`);
		console.log(`[OrchestratorServer] REST: http://localhost:${serverPort}/orchestrator/request`);
		console.log(`[OrchestratorServer] SSE: http://localhost:${serverPort}/orchestrator/events`);
		console.log(`[OrchestratorServer] Long-poll: http://localhost:${serverPort}/orchestrator/poll`);
	} catch (error) {
		console.error('[OrchestratorServer] Failed to start server:', error);
		await orchestrator.shutdown();
		process.exit(1);
	}

	// Handle shutdown signals
	const handleShutdown = async (signal: string) => {
		console.log(`\n[OrchestratorServer] Received ${signal}, shutting down...`);

		try {
			await app.close();
			console.log('[OrchestratorServer] HTTP server closed');

			await orchestrator.shutdown();
			console.log('[OrchestratorServer] Orchestrator stopped');

			process.exit(0);
		} catch (error) {
			console.error('[OrchestratorServer] Error during shutdown:', error);
			process.exit(1);
		}
	};

	process.on('SIGINT', () => void handleShutdown('SIGINT'));
	process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
}

// Start server
main().catch(error => {
	console.error('[OrchestratorServer] Fatal error:', error);
	process.exit(1);
});
