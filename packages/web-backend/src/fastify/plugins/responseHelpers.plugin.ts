import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Extension of FastifyReply to add utility methods
 * These methods match the Express response helpers for consistency
 */
declare module 'fastify' {
	interface FastifyReply {
		jsonSuccess<T>(data: T, statusCode?: number): FastifyReply;
		jsonError(error: string, statusCode?: number): FastifyReply;
	}
}

/**
 * Plugin to add response helper methods to FastifyReply
 * Similar to Express setupResponseHelpers middleware
 *
 * Adds:
 * - reply.jsonSuccess(data, statusCode?) - Send success response
 * - reply.jsonError(error, statusCode?) - Send error response
 */
const responseHelpersPlugin: FastifyPluginAsync = async fastify => {
	// Add jsonSuccess method to reply object
	// @formatter:off
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fastify.decorateReply('jsonSuccess', function <T>(this: any, data: T, statusCode = 200) {
		// @formatter:on
		return this.status(statusCode).send({
			success: true,
			data,
		});
	});

	// Add jsonError method to reply object
	// @formatter:off
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fastify.decorateReply('jsonError', function (this: any, error: string, statusCode = 400) {
		// @formatter:on
		return this.status(statusCode).send({
			success: false,
			error,
		});
	});
};

export default fp(responseHelpersPlugin, {
	name: 'responseHelpers',
});
