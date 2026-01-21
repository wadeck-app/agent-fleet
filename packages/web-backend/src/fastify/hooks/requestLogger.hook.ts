import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createLogger } from 'shared-common/logger';

const log = createLogger('RequestLogger');

/**
 * Simple request logger hook
 * Logs completed requests with format: "GET /api/path 200 123ms"
 * Uses different log levels based on status code:
 * - 5xx: error (red)
 * - 4xx: warn (orange)
 * - 2xx/3xx: info (default)
 */
const requestLoggerHook: FastifyPluginAsync = async fastify => {
	fastify.addHook('onRequest', async (request, _reply) => {
		// Store start time
		(request as { startTime?: number }).startTime = Date.now();
	});

	fastify.addHook('onResponse', async (request, reply) => {
		const startTime = (request as { startTime?: number }).startTime;
		// Validate startTime is a number before calculating duration
		const duration = typeof startTime === 'number' ? Date.now() - startTime : 0;
		const method = request.method;
		const url = request.url;
		const statusCode = reply.statusCode;

		const logMessage = `${method} ${url} ${statusCode} ${duration.toFixed(0)}ms`;

		// Log with appropriate level based on status code
		if (statusCode >= 500) {
			log.error(logMessage);
		} else if (statusCode >= 400) {
			log.warn(logMessage);
		} else {
			log.info(logMessage);
		}
	});
};

export default fp(requestLoggerHook, {
	name: 'requestLogger',
});
