/**
 * ===========================================================================================
 * REST ROUTE - HTTP REQUEST/RESPONSE
 * ===========================================================================================
 *
 * REST endpoint for B→O requests.
 * Used by REST+SSE and REST+LongPolling transports.
 *
 * Endpoint:
 * - POST /orchestrator/request - Send B→O request, receive response
 *
 * ===========================================================================================
 */

import type { FastifyInstance } from 'fastify';

import type { OrchestratorRequestHandler } from '../OrchestratorRequestHandler.js';

/**
 * Register REST route
 *
 * @param app - Fastify instance
 * @param requestHandler - Request handler
 */
export function registerRestRoute(app: FastifyInstance, requestHandler: OrchestratorRequestHandler): void {
	app.post('/orchestrator/request', async (request, reply) => {
		try {
			const b2oRequest = request.body as any;

			// Process request
			const response = await requestHandler.handleRequest(b2oRequest);

			// Return response
			return reply.code(200).send(response);
		} catch (error: any) {
			console.error('[RestRoute] Error handling request:', error);

			return reply.code(500).send({
				error: {
					code: 'INTERNAL_ERROR',
					message: error.message || 'Internal server error',
				},
			});
		}
	});

	console.log('[RestRoute] REST route registered at POST /orchestrator/request');
}
