import { type FastifyError, type FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from 'shared-common/logger';
import { ZodError } from 'zod';

import { ERROR_CODES, type ErrorResponse, HttpException } from '@app/shared/exceptions/http-exceptions';

const onlyUnexpectedErrorLogged = false;

/**
 * ===========================================================================================
 * ERROR HANDLER HOOK - STANDARDIZED ERROR RESPONSES
 * ===========================================================================================
 *
 * Handles all errors with standardized format:
 * {
 *   error: string;        // Human-readable message
 *   code: string;         // Machine-readable code
 *   statusCode: number;   // HTTP status code
 *   timestamp: string;    // ISO 8601 timestamp
 *   details?: any;        // Optional context
 * }
 *
 * Handles:
 * - HttpException (custom app errors with error codes)
 * - ZodError (validation errors)
 * - Fastify validation errors
 * - Generic errors (500 with sanitized message)
 *
 * ===========================================================================================
 */
const errorHandlerHook: FastifyPluginAsync = async fastify => {
	fastify.setErrorHandler((error: FastifyError | ZodError | HttpException, request, reply) => {
		const timestamp = new Date().toISOString();
		const statusCode = ('statusCode' in error ? error.statusCode : undefined) ?? 500;

		// Log error details (always log 5xx errors, optionally log others)
		const shouldLogDetails =
			statusCode >= 500 || !onlyUnexpectedErrorLogged || process.env.NODE_ENV === 'development';

		if (shouldLogDetails) {
			const errorCode = 'code' in error ? error.code : 'UNKNOWN_ERROR';
			logger.error(
				`Error handling ${request.method} ${request.url} - ${statusCode} ${errorCode}: ${error.message}`
			);

			// Log stack trace for 5xx errors
			if (statusCode >= 500 && error.stack) {
				logger.error(`Stack trace:\n${error.stack}`);
			}

			// Log additional error details if available
			if ('details' in error && error.details) {
				logger.error('Error details:', error.details);
			}
		}

		// Handle custom HttpException (with error codes)
		if (error instanceof HttpException) {
			const response: ErrorResponse = {
				error: error.message,
				code: error.code,
				statusCode: error.statusCode,
				timestamp,
				...(error.details && { details: error.details }),
			};
			return reply.status(error.statusCode).send(response);
		}

		// Handle Zod validation errors
		if (error instanceof ZodError) {
			const response: ErrorResponse = {
				error: 'Validation failed',
				code: ERROR_CODES.VALIDATION_FAILED,
				statusCode: 400,
				timestamp,
				details: error.issues.map(e => ({
					field: e.path.join('.'),
					message: e.message,
				})),
			};
			return reply.status(400).send(response);
		}

		// Handle Fastify validation errors
		if ('validation' in error && error.validation) {
			const response: ErrorResponse = {
				error: 'Validation failed',
				code: ERROR_CODES.VALIDATION_FAILED,
				statusCode: 400,
				timestamp,
				details: error.validation,
			};
			return reply.status(400).send(response);
		}

		// Handle generic errors (sanitize message in production)
		const message =
			process.env.NODE_ENV === 'production' && statusCode === 500
				? 'Internal Server Error'
				: error.message || 'Internal Server Error';

		if (onlyUnexpectedErrorLogged) {
			logger.error('Unexpected error', error);
		}

		const response: ErrorResponse = {
			error: message,
			code: ERROR_CODES.INTERNAL_SERVER_ERROR,
			statusCode,
			timestamp,
			...(process.env.NODE_ENV === 'development' && error.stack && { stack: error.stack }),
		};

		return reply.status(statusCode).send(response);
	});
};

export default fp(errorHandlerHook, {
	name: 'errorHandler',
});
