import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { logger } from '@/utils/logger';

/**
 * Simple request logger hook
 * Logs only completed requests with format: "GET /api/path 200 123ms"
 */
const requestLoggerHook: FastifyPluginAsync = async fastify => {
	fastify.addHook('onRequest', async (request, _reply) => {
		// Store start time
		(request as any).startTime = Date.now();
	});

	fastify.addHook('onResponse', async (request, reply) => {
		const startTime = (request as any).startTime;
		// Validate startTime is a number before calculating duration
		const duration = typeof startTime === 'number' ? Date.now() - startTime : 0;
		const method = request.method;
		const url = request.url;
		const statusCode = reply.statusCode;

		// Log completed request
		logger.info(`${method} ${url} ${statusCode} ${duration.toFixed(0)}ms`);
	});
};

export default fp(requestLoggerHook, {
	name: 'requestLogger',
});
