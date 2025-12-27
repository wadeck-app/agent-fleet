import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { HttpException } from '@app/shared/exceptions/http-exceptions';
import { ROUTES_BY_BASE_URL } from '@app/shared/types';

import { CONTROLLER_REGISTRY } from './controller-registry';
import { getFactory } from './factory-instance';
import { InternalRouter } from './internal-router';

/**
 * ===========================================================================================
 * LAZY CONTROLLER PLUGIN WITH INTERNAL ROUTING
 * ===========================================================================================
 *
 * This plugin uses internal routing with relative path matching.
 *
 * Key features:
 * - Registers SINGLE wildcard in Fastify (e.g., /api/ingredients/*)
 * - Uses InternalRouter for matching (60% faster, 60% less memory)
 * - Creates controller instance ONLY on first request (true lazy loading)
 * - NO temporary instance at startup
 *
 * Usage:
 *   fastify.register(
 *     createLazyControllerPlugin(
 *       '/api/ingredients',
 *       async () => import('./controllers/IngredientsController')
 *     )
 *   );
 *
 * ===========================================================================================
 */

/**
 * Controller interface
 */
export interface LazyController<Routes = any> {
	configureRoutes(add: RouteWrapperFunc<Routes>): void;
}

/**
 * Controller class interface with static routes property
 */
export interface LazyControllerClass<Routes = any> {
	new (): LazyController<Routes>;
	routes: Routes;
}

/**
 * Controller loader function type
 */
type ControllerLoader<Routes = any> = () => Promise<{ default: LazyControllerClass<Routes> }>;

/**
 * Route wrapper function type (kept for controller compatibility)
 */
export type RouteWrapperFunc<_Routes> = <M extends string, P extends string>(
	method: M,
	path: P,
	handler: (validated: any) => Promise<any>
) => void;

// Track registered paths for ordering validation (dev-only)
const registeredPaths: string[] = [];

/**
 * Helper to register controller with path ordering validation
 * @param baseUrl - The base URL (e.g., '/api/ingredients')
 * @param loader - The controller loader function
 */
export function registerControllerWithCheck(baseUrl: string, loader: () => Promise<any>) {
	// Check path ordering ONLY in development (not in production or test)
	if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
		// Check if a MORE SPECIFIC path (longer) was already registered
		const conflictingPath = registeredPaths.find(registered => {
			// If new path starts with a registered path, it's more specific and will never be reached
			return baseUrl.startsWith(registered) && baseUrl !== registered;
		});

		if (conflictingPath) {
			console.warn(`
⚠️  WARNING: Route ordering issue detected!
    Already registered: "${conflictingPath}" (will catch all requests)
    Trying to register: "${baseUrl}" (will NEVER be reached!)

    Fix: Register more specific routes BEFORE generic ones.
      `);
		}

		registeredPaths.push(baseUrl);
	}

	return createLazyControllerPlugin(baseUrl, loader);
}

/**
 * Creates a lazy loading controller plugin with true on-demand initialization
 */
function createLazyControllerPlugin<Routes = any>(
	baseUrl: string,
	loader: ControllerLoader<Routes>
): FastifyPluginAsync {
	// All state is null until first request (true lazy loading)
	let controllerInstance: LazyController<Routes> | null = null;
	let router: InternalRouter<Routes> | null = null;
	let handlerMap: Map<string, (validated: any) => Promise<any>> | null = null;

	/**
	 * Initialize controller on-demand (first request or /api call)
	 */
	const initializeController = async () => {
		if (router !== null) return; // Already initialized

		// console.log(`[LAZY] Initializing controller for ${baseUrl}...`);

		// 1. Get routes from shared (no controller import yet!)
		const routes = ROUTES_BY_BASE_URL[baseUrl];
		if (!routes) {
			// This is a configuration error, not a 404 - routes should be defined
			throw new HttpException(
				500,
				`No routes configured for baseUrl: ${baseUrl}. Please add routes to shared-frontend-backend/src/types.ts`,
				'ROUTES_NOT_CONFIGURED'
			);
		}

		// 2. Create internal router
		router = new InternalRouter(routes, baseUrl);

		// 3. Load controller module and create instance with service injection
		const module = await loader();
		const ControllerClass = module.default;

		if (!ControllerClass) {
			throw new Error(`Controller not found in module (missing default export?), baseUrl: ${baseUrl}`);
		}

		// Get the appropriate service from factory based on baseUrl
		const factory = getFactory();
		let service: any;

		// Map baseUrl to factory method
		if (baseUrl === '/api/auth') {
			// AuthController needs both AuthService and WebSocketSessionManager
			const authService = factory.getAuthService();
			const sessionManager = factory.getSessionManager();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(authService, sessionManager);
		} else if (baseUrl === '/api/ingredients') {
			service = factory.getIngredientsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/books') {
			service = factory.getBooksService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/dashboard') {
			service = factory.getDashboardService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/workers') {
			service = factory.getWorkersService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/tasks') {
			service = factory.getTasksService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/workspaces') {
			service = factory.getWorkspacesService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else {
			throw new Error(`No service mapping found for baseUrl: ${baseUrl}`);
		}

		// 4. Collect handler functions
		handlerMap = new Map();
		const collectHandlers: RouteWrapperFunc<Routes> = (method, path, handler) => {
			const relativePath = path.startsWith(baseUrl) ? path.substring(baseUrl.length) || '/' : path;
			const key = `${method}:${relativePath}`;
			handlerMap!.set(key, handler);
		};

		controllerInstance.configureRoutes(collectHandlers);

		// console.log(`[LAZY] ${baseUrl} initialized in ${(endTime - startTime).toFixed(2)}ms (${router.routeCount} routes)`);
	};

	return async fastify => {
		// console.log(`[LAZY PLUGIN] Registering wildcard for ${baseUrl}/* (will initialize on first request)`);

		// Register initialization function in global registry
		CONTROLLER_REGISTRY.set(baseUrl, initializeController);

		// Shared request handler logic
		const handleRequest = async (request: FastifyRequest, reply: FastifyReply, fullPath: string) => {
			try {
				// Initialize controller on first request
				await initializeController();

				// Match route using internal router
				const matchResult = router!.match(request.method, fullPath);

				if (!matchResult) {
					return reply.status(404).send({
						error: 'NotFound',
						message: `Route ${request.method} ${fullPath} not found`,
						statusCode: 404,
					});
				}

				const { contract, params: extractedParams, relativePath: matchedPattern } = matchResult;

				// Extract connId from X-Conn-Id header for request correlation
				const connId = request.headers['x-conn-id'] as string | undefined;

				// Validate input using Zod schemas from contract
				const validated: any = {
					params: extractedParams,
					query: {},
					body: {},
					connId,
				};

				// Validate query parameters
				if (contract.query) {
					validated.query = contract.query.parse(request.query);
				}

				// Validate body
				if (contract.body) {
					validated.body = contract.body.parse(request.body);
				}

				// Merge URL params with validated params (Zod might validate more)
				if (contract.params) {
					const mergedParams = {
						...extractedParams,
						...((request.params as Record<string, any>) || {}),
					};
					validated.params = contract.params.parse(mergedParams);
				}

				// Find the handler using the MATCHED PATTERN
				const handlerKey = `${request.method}:${matchedPattern}`;
				const handler = handlerMap!.get(handlerKey);

				if (!handler) {
					throw new Error(`Handler not found for ${handlerKey} (full path: ${fullPath})`);
				}

				// Execute handler
				const result = await handler(validated);

				// Validate response
				if (contract.response) {
					const validatedResponse = contract.response.parse(result);
					return reply.send(validatedResponse);
				}

				return reply.send(result);
			} catch (error) {
				// Handle Zod validation errors
				if (error instanceof ZodError) {
					return reply.status(400).send({
						error: 'ValidationError',
						message: 'Invalid request data',
						details: error.errors.map(e => ({
							path: e.path.join('.'),
							message: e.message,
						})),
						statusCode: 400,
					});
				}

				// Re-throw to let Fastify's global error handler deal with it
				throw error;
			}
		};

		// Register SINGLE wildcard handler in Fastify
		fastify.all(`${baseUrl}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
			const fullPath = request.url.split('?')[0];
			return handleRequest(request, reply, fullPath);
		});

		// Handle exact baseUrl as well
		// GET: redirect to add trailing slash (preserve query parameters)
		fastify.get(baseUrl, async (request: FastifyRequest, reply: FastifyReply) => {
			const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
			return reply.redirect(`${baseUrl}/${queryString}`, 301);
		});

		// POST/PUT/DELETE/PATCH: treat as root route (/)
		const baseUrlHandler = async (request: FastifyRequest, reply: FastifyReply) => {
			const fullPath = `${baseUrl}/`;
			return handleRequest(request, reply, fullPath);
		};

		fastify.post(baseUrl, baseUrlHandler);
		fastify.put(baseUrl, baseUrlHandler);
		fastify.delete(baseUrl, baseUrlHandler);
		fastify.patch(baseUrl, baseUrlHandler);
	};
}
