import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from 'shared-common/logger';

/**
 * Only available when NOT in production mode
 */
export const testRoutes: FastifyPluginAsync = async fastify => {
	fastify.get('/api/test/health', healthHandler);
	fastify.post('/api/test/clear-data', clearDataHandler);
};

//TODO rename to metadata, to avoid confusion with /health
/**
 * Provide information for tests to validate it's the expected server in expected configuration
 * GET /api/test/health
 */
async function healthHandler(request: FastifyRequest, reply: FastifyReply) {
	if (process.env.USE_PRODUCTION_DB === 'true') {
		return reply.status(503).send({
			error: 'Test health endpoint is not available in production mode',
			inMemory: false,
			testMode: false,
			workspaceId: parseInt(process.env.WORKSPACE_ID || '0', 10),
		});
	}

	return reply.send({
		status: 'ok',
		testMode: true,
		inMemory: true,
		port: process.env.PORT,
		workspaceId: parseInt(process.env.WORKSPACE_ID || '0', 10),
		runId: process.env.RUN_ID || 'unknown',
		pid: process.pid,
		timestamp: new Date().toISOString(),
	});
}

/**
 * Clear all in-memory data for this backend process
 * POST /api/test/clear-data
 */
async function clearDataHandler(request: FastifyRequest, reply: FastifyReply) {
	try {
		if (process.env.USE_PRODUCTION_DB === 'true') {
			return reply.status(403).send({
				error: 'Clear data endpoint is not available in production mode',
			});
		}

		//NOMERGE link with DataStoreFactory
		//clearAllInMemoryData();

		return reply.status(200).send({
			message: 'In-memory data cleared successfully for this backend process',
		});
	} catch (error: unknown) {
		logger.error('Error clearing in-memory data:', error);
		return reply.status(500).send({
			error: 'Failed to clear in-memory data',
			details: error instanceof Error ? String(error) : 'Unknown error',
		});
	}
}
