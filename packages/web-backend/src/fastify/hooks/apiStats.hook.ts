import { randomUUID } from 'node:crypto';
import { type FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { apiStatsManager } from '../../utils/apiStats';

/**
 * API stats tracking hook for Fastify
 * Similar to Express apiStatsMiddleware
 *
 * Tracks API request statistics (for Google Sheets API calls monitoring)
 */
const apiStatsHook: FastifyPluginAsync = async fastify => {
	// Track request start
	fastify.addHook('onRequest', async (request, _reply) => {
		const requestId = randomUUID();
		// Store requestId in request context for response hook
		(request as { statsId?: string }).statsId = requestId;
		apiStatsManager.startRequest(requestId, request.method, request.url);
	});

	// Track request end
	fastify.addHook('onResponse', async (_request, _reply) => {
		apiStatsManager.endRequest();
	});
};

export default fp(apiStatsHook, {
	name: 'apiStats',
});
