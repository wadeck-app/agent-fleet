import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from 'shared-common/logger';
import { ZodError } from 'zod';

import { HttpException } from '@app/shared/exceptions/http-exceptions';
import { ROUTES_BY_BASE_URL } from '@app/shared/types';

import { CONTROLLER_REGISTRY } from './controller-registry';
import { getFactory } from './factory-instance';
import type { RouteWrapperFunc } from './fastify-wrapper';
import { InternalRouter } from './internal-router';

const log = createLogger('LazyControllerPlugin');

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
export interface LazyController<Routes = unknown> {
	configureRoutes(add: RouteWrapperFunc<Routes>): void;
}

/**
 * Controller with the contract-specific wrapper type erased ("never" parameter), so every concrete controller is assignable
 */
export interface ErasedLazyController {
	configureRoutes(add: never): void;
}

/**
 * Controller class interface with static routes property
 */
export interface LazyControllerClass {
	// Constructor arguments (services) are injected dynamically per baseUrl
	new (...args: never[]): ErasedLazyController;
	routes: unknown;
}

/**
 * Controller loader function type
 */
type ControllerLoader = () => Promise<{ default: unknown }>;

/**
 * Validated request handed to a route handler by the plugin
 */
export interface ValidatedRequest {
	params: unknown;
	query: unknown;
	body: unknown;
	connId: string | undefined;
}

/**
 * Handler registered by a controller through the route wrapper
 */
type RouteHandlerFunc = (validated: ValidatedRequest) => Promise<unknown>;

/**
 * Loosely typed route collector: the plugin only stores handlers by key, the contract typing is enforced by the controllers
 */
type RouteHandlerCollector = (method: string, path: string, handler: RouteHandlerFunc) => void;

// Track registered paths for ordering validation (dev-only)
const registeredPaths: string[] = [];

/**
 * Helper to register controller with path ordering validation
 * @param baseUrl - The base URL (e.g., '/api/ingredients')
 * @param loader - The controller loader function
 */
export function registerControllerWithCheck(baseUrl: string, loader: ControllerLoader) {
	// Check path ordering ONLY in development (not in production or test)
	if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
		// Check if a MORE SPECIFIC path (longer) was already registered
		const conflictingPath = registeredPaths.find(registered => {
			// If new path starts with a registered path, it's more specific and will never be reached
			return baseUrl.startsWith(registered) && baseUrl !== registered;
		});

		if (conflictingPath) {
			log.warn(`
  WARNING: Route ordering issue detected!
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
function createLazyControllerPlugin(baseUrl: string, loader: ControllerLoader): FastifyPluginAsync {
	// All state is null until first request (true lazy loading)
	let controllerInstance: ErasedLazyController | null = null;
	let router: InternalRouter<unknown> | null = null;
	let handlerMap: Map<string, RouteHandlerFunc> | null = null;
	// Initialization promise ensures concurrent requests wait for a single init
	let initializationPromise: Promise<void> | null = null;

	/**
	 * Initialize controller on-demand (first request or /api call).
	 * Uses a shared promise to prevent race conditions under concurrent requests:
	 * without this, a second request could see router!=null but handlerMap==null.
	 */
	const initializeController = async () => {
		if (initializationPromise !== null) {
			await initializationPromise;
			return;
		}
		initializationPromise = doInitialize();
		await initializationPromise;
	};

	const doInitialize = async () => {
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
		// violations-suppress: ts/no-unsafe-type-cast loaders come from the untyped routes table; the default export is a controller class by convention and is checked for presence below
		const ControllerClass = module.default as LazyControllerClass | undefined;

		if (!ControllerClass) {
			throw new Error(`Controller not found in module (missing default export?), baseUrl: ${baseUrl}`);
		}

		// Get the appropriate service from factory based on baseUrl
		const factory = getFactory();

		//FIXME refactor this injection in a cleaner way!!!

		// Map baseUrl to factory method
		if (baseUrl === '/api/auth') {
			// AuthController needs both AuthService and TransportSessionManager
			const authService = factory.getAuthService();
			const sessionManager = factory.getSessionManager();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(authService, sessionManager);
		} else if (baseUrl === '/api/ingredients') {
			const service = factory.getIngredientsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/books') {
			const service = factory.getBooksService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/dashboard') {
			const service = factory.getDashboardService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/flows') {
			const service = factory.getFlowsService();
			const flowFeedbackService = factory.getFlowFeedbackService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service, flowFeedbackService);
		} else if (baseUrl === '/api/flow-daemon') {
			const service = factory.getFlowQueryService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/workers') {
			const service = factory.getWorkersService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/tasks') {
			const service = factory.getTasksService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/workspaces') {
			// Unified controller needs 5 services
			const workspacesService = factory.getWorkspacesService();
			const workspaceScriptsService = factory.getWorkspaceScriptsService();
			const scriptProcessService = factory.getScriptProcessService();
			const scriptLogsStorage = factory.getScriptLogsStorage();
			const workspaceFileService = factory.getWorkspaceFileService();
			// violations-suppress: ts/no-unsafe-type-cast dynamic controller instantiation; ControllerClass is a union of concrete classes with different constructor signatures
			controllerInstance = new (ControllerClass as unknown as new (...args: unknown[]) => ErasedLazyController)(
				workspacesService,
				workspaceScriptsService,
				scriptProcessService,
				scriptLogsStorage,
				workspaceFileService
			);
		} else if (baseUrl === '/api/interventions') {
			const service = factory.getInterventionsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/products') {
			const service = factory.getProductsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/projects') {
			const service = factory.getProjectsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/flow-feedback') {
			const service = factory.getFlowFeedbackService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service);
		} else if (baseUrl === '/api/tickets') {
			const service = factory.getTicketsService();
			const flowFeedbackService = factory.getFlowFeedbackService();
			const flowProposalsService = factory.getFlowProposalsService();
			// @ts-expect-error - Dynamic service injection based on baseUrl
			controllerInstance = new ControllerClass(service, flowFeedbackService, flowProposalsService);
		} else {
			throw new Error(`No service mapping found for baseUrl: ${baseUrl}`);
		}

		// 4. Collect handler functions
		if (!controllerInstance) {
			throw new Error(`Failed to initialize controller for baseUrl: ${baseUrl}`);
		}

		handlerMap = new Map();
		const collectHandlers: RouteHandlerCollector = (method, path, handler) => {
			const relativePath = path.startsWith(baseUrl) ? path.substring(baseUrl.length) || '/' : path;
			const key = `${method}:${relativePath}`;
			handlerMap!.set(key, handler);
		};

		// violations-suppress: ts/no-unsafe-type-cast controllers receive the contract-typed wrapper; the collector only needs the untyped handler
		controllerInstance.configureRoutes(collectHandlers as never);

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
				const validated: ValidatedRequest = {
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
						...((request.params as object | null) || {}),
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
						details: error.issues.map(e => ({
							path: e.path.join('.'),
							message: String(e),
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
