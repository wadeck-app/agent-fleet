import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { ApiUrl } from '@app/shared/route-builder';

/**
 * ===========================================================================================
 * ULTRA-TYPED ROUTE WRAPPER FUNCTION (GENERIC VERSION)
 * ===========================================================================================
 *
 * This version takes a specific contract as a type parameter, allowing each controller
 * to have its own routes without conflicts.
 *
 * Perfect auto-completion in IntelliJ!
 *
 * Updated for new structure: apiRoute > httpMethod > request/response types
 *
 * ===========================================================================================
 */

/**
 * HTTP Methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Get all paths that support a given HTTP method
 * Adapted for new structure: Routes[Path][Method] instead of Routes[Method][Path]
 */
export type PathsForMethod<M extends HttpMethod, Routes> = {
	[P in keyof Routes]: M extends keyof Routes[P] ? P : never;
}[keyof Routes] &
	ApiUrl;

/**
 * Extract params type for a given method and path
 * Adapted for new structure: Routes[Path][Method] instead of Routes[Method][Path]
 */
export type RouteParams<M extends HttpMethod, P extends string, Routes> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { params: infer Params }
			? Params extends { parse: (data: any) => infer T }
				? T
				: never
			: Record<string, never>
		: Record<string, never>
	: Record<string, never>;

/**
 * Extract query type for a given method and path
 * Adapted for new structure: Routes[Path][Method] instead of Routes[Method][Path]
 */
export type RouteQuery<M extends HttpMethod, P extends string, Routes> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { query: infer Query }
			? Query extends { parse: (data: any) => infer T }
				? T
				: never
			: Record<string, never>
		: Record<string, never>
	: Record<string, never>;

/**
 * Extract body type for a given method and path
 * Adapted for new structure: Routes[Path][Method] instead of Routes[Method][Path]
 */
export type RouteBody<M extends HttpMethod, P extends string, Routes> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { body: infer Body }
			? Body extends { parse: (data: any) => infer T }
				? T
				: never
			: Record<string, never>
		: Record<string, never>
	: Record<string, never>;

/**
 * Extract response type for a given method and path
 * Adapted for new structure: Routes[Path][Method] instead of Routes[Method][Path]
 */
export type RouteResponse<M extends HttpMethod, P extends string, Routes> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { response: infer Response }
			? Response extends { parse: (data: any) => infer T }
				? T
				: never
			: never
		: never
	: never;

/**
 * Ultra-typed route wrapper function for a specific contract
 */
export type RouteWrapperFunc<Routes> = <M extends HttpMethod, P extends PathsForMethod<M, Routes>>(
	method: M,
	path: P,
	handler: (validated: {
		params: RouteParams<M, P, Routes>;
		query: RouteQuery<M, P, Routes>;
		body: RouteBody<M, P, Routes>;
		reply: FastifyReply;
		request: FastifyRequest;
		cookies: Record<string, string | undefined>;
		connId?: string;
	}) => Promise<RouteResponse<M, P, Routes>>
) => void;

/**
 * Helper to handle Zod errors
 */
function handleZodError(error: ZodError, reply: FastifyReply) {
	return reply.status(400).send({
		error: 'Validation failed',
		details: error.issues.map(e => ({
			path: e.path.join('.'),
			message: e.message,
		})),
	});
}

/**
 * Helper to handle general errors
 * Only handles ZodError here, all other errors are re-thrown to reach Fastify's global error handler
 */
function handleError(error: unknown, reply: FastifyReply) {
	if (error instanceof ZodError) {
		return handleZodError(error, reply);
	}

	// Re-throw to let Fastify's global error handler deal with it
	throw error;
}

/**
 * Creates a route wrapper function with full type safety for a specific contract
 */
export function createRouteWrapper<Routes>(fastify: FastifyInstance, routes: Routes): RouteWrapperFunc<Routes> {
	return function registerRoute<M extends HttpMethod, P extends PathsForMethod<M, Routes>>(
		method: M,
		path: P,
		handler: (validated: {
			params: RouteParams<M, P, Routes>;
			query: RouteQuery<M, P, Routes>;
			body: RouteBody<M, P, Routes>;
			reply: FastifyReply;
			request: FastifyRequest;
			cookies: Record<string, string | undefined>;
			connId?: string;
		}) => Promise<RouteResponse<M, P, Routes>>
	): void {
		// @formatter:off
		// Access pattern changed: routes[path][method] instead of routes[method][path]
		// @formatter:on
		const contract = (routes as any)[path]?.[method];

		if (!contract) {
			throw new Error(`No contract found for ${method} ${path}`);
		}

		const fastifyHandler = async (req: FastifyRequest, reply: FastifyReply) => {
			try {
				// Extract connId from X-Conn-Id header for request correlation
				const connId = req.headers['x-conn-id'] as string | undefined;

				const validated: any = {
					params: {},
					query: {},
					body: {},
					reply,
					request: req,
					cookies: (req as any).cookies || {},
					connId,
				};

				if (contract.params) {
					validated.params = contract.params.parse(req.params);
				}

				if (contract.query) {
					validated.query = contract.query.parse(req.query);
				}

				if (contract.body) {
					validated.body = contract.body.parse(req.body);
				}

				const result = await handler(validated);
				const validatedResponse = contract.response.parse(result);

				return reply.send(validatedResponse);
			} catch (error) {
				return handleError(error, reply);
			}
		};

		const fastifyMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
		fastify[fastifyMethod](path, fastifyHandler);
	};
}
