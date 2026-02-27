import type { FastifyInstance } from 'fastify';

import { DevHoldService } from '../../services/DevHoldService';

/**
 * DevHolds Plugin - Enables automated tests to control when the server responds to specific requests
 *
 * This plugin registers an onRequest hook that pauses incoming requests matching registered patterns,
 * enabling reliable visual screenshots of in-flight loading states.
 *
 * Routes:
 * - POST /dev/hold - Register a hold for a specific pattern
 * - DELETE /dev/hold/:id - Release a specific hold
 * - GET /dev/holds - List all active holds
 *
 * NOTE: This plugin should NEVER be registered in production (NODE_ENV === 'production')
 */
export async function registerDevHoldsPlugin(fastify: FastifyInstance): Promise<void> {
	const service = new DevHoldService();

	// Hold matching requests before any processing
	fastify.addHook('onRequest', async (request, _reply) => {
		const holdPromise = service.getHoldPromise(request.method, request.url);
		if (holdPromise) {
			await holdPromise;
		}
	});

	// POST /dev/hold — register a hold
	fastify.post<{ Body: { pattern: string } }>('/dev/hold', async (request, reply) => {
		const { pattern } = request.body;
		if (!pattern) {
			return reply.status(400).send({ error: 'pattern is required' });
		}
		const holdId = service.register(pattern);
		return reply.status(201).send({ holdId });
	});

	// DELETE /dev/hold/:id — release a hold
	fastify.delete<{ Params: { id: string } }>('/dev/hold/:id', async (request, reply) => {
		const released = service.release(request.params.id);
		return reply.send({ released });
	});

	// GET /dev/holds — list active holds
	fastify.get('/dev/holds', async (_request, reply) => {
		return reply.send({ holds: service.list() });
	});
}
