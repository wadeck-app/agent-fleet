import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Options for latency simulator hook
 */
interface LatencyOptions {
	minDelay: number;
	maxDelay: number;
}

/**
 * Latency simulator hook for Fastify
 * Similar to Express latencySimulator middleware
 *
 * Adds a random delay between minDelay and maxDelay to all requests
 * (except /health) to simulate network latency in development
 */
const latencySimulatorHook: FastifyPluginAsync<LatencyOptions> = async (fastify, opts) => {
	const { minDelay, maxDelay } = opts;

	fastify.addHook('onRequest', async (request, _reply) => {
		// Skip latency for health checks
		if (request.url === '/health') {
			return;
		}

		// Generate random delay between min and max
		const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

		fastify.log.debug(`[Latency Simulator] Adding ${delay}ms delay to ${request.method} ${request.url}`);

		// Wait for the random delay
		await new Promise(resolve => setTimeout(resolve, delay));
	});
};

export default fp(latencySimulatorHook, {
	name: 'latencySimulator',
});
