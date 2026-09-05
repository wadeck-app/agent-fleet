import { createLogger } from 'shared-common/logger';

import type { HttpMethod } from '@app/shared/route-builder';
import type { TransportRequest, TransportResponse } from '@app/shared/transport';
import { ALL_API_ROUTES } from '@app/shared/types';

import type { DataStoreFactory } from '../factories/DataStoreFactory';
import type { LazyController } from '../utils/lazy-controller-plugin';

const log = createLogger('TransportRouter');

/**
 * ===========================================================================================
 * TRANSPORT ROUTER - ROUTE WEBSOCKET MESSAGES TO CONTROLLERS
 * ===========================================================================================
 *
 * Routes incoming WebSocket TransportRequest messages to appropriate controllers.
 *
 * Responsibilities:
 * - Parse TransportRequest from WebSocket message
 * - Match path to registered routes from ALL_API_ROUTES
 * - Extract params from path (e.g., /api/tasks/:id → { id: '123' })
 * - Call appropriate controller method
 * - Return TransportResponse
 * - Handle errors gracefully
 * - Add userId to request context from session
 *
 * Architecture:
 * WebSocket → TransportRouter → Controller → Service → Repository
 *
 * @example
 * ```typescript
 * const router = new TransportRouter(factory);
 *
 * const request: TransportRequest = {
 *   id: 'req-123',
 *   method: 'GET',
 *   path: '/api/tasks/task-456',
 *   timestamp: Date.now(),
 * };
 *
 * const response = await router.handleRequest(request);
 * // response.body contains the task data
 * ```
 *
 * ===========================================================================================
 */

/**
 * Route handler function signature
 */
type RouteHandler = (request: TransportRequest) => Promise<any>;

/**
 * Route registration entry
 */
interface RouteEntry {
	method: HttpMethod;
	pattern: RegExp;
	paramNames: string[];
	handler: RouteHandler;
}

/**
 * Transport Router
 *
 * Routes WebSocket requests to controllers based on ALL_API_ROUTES.
 */
export class TransportRouter {
	private routes: RouteEntry[] = [];
	private controllersCache = new Map<string, LazyController<any>>();

	constructor(private factory: DataStoreFactory) {
		this.registerRoutes();
	}

	/**
	 * Register all routes from ALL_API_ROUTES
	 * Converts route definitions to regex patterns for matching
	 */
	private registerRoutes(): void {
		// Import ALL_API_ROUTES dynamically to avoid circular dependencies
		const routes = this.getAllApiRoutes();

		// Register each route
		Object.entries(routes).forEach(([path, methods]) => {
			Object.keys(methods as any).forEach((method: string) => {
				const httpMethod = method as HttpMethod;

				// Convert path to regex pattern
				const { pattern, paramNames } = this.pathToRegex(path);

				// Create handler that lazily loads the controller
				const handler = this.createHandler(path, httpMethod);

				this.routes.push({
					method: httpMethod,
					pattern,
					paramNames,
					handler,
				});
			});
		});
	}

	/**
	 * Get ALL_API_ROUTES
	 * Separated for testability
	 */
	private getAllApiRoutes(): typeof ALL_API_ROUTES {
		return ALL_API_ROUTES;
	}

	/**
	 * Convert path pattern to regex
	 * Extracts parameter names for later extraction
	 *
	 * @example
	 * '/api/tasks/:id' → { pattern: /^\/api\/tasks\/([^/]+)$/, paramNames: ['id'] }
	 */
	private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
		const paramNames: string[] = [];
		let regexPattern = path;

		// Replace :paramName with capture groups
		regexPattern = regexPattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, paramName) => {
			paramNames.push(paramName);
			return '([^/]+)';
		});

		// Make trailing slash optional: /path/ or /path both match
		// Remove trailing slash if present, then make it optional
		regexPattern = regexPattern.replace(/\/$/, '');

		// Anchor regex to match full path with optional trailing slash
		const pattern = new RegExp(`^${regexPattern}/?$`);

		return { pattern, paramNames };
	}

	/**
	 * Create handler for a specific route
	 * Handler lazily loads the controller and calls the appropriate method
	 */
	private createHandler(path: string, method: HttpMethod): RouteHandler {
		return async (request: TransportRequest) => {
			// Get or create controller
			const controller = await this.getController(path);

			if (!controller) {
				throw new Error(`No controller found for path: ${path}`);
			}

			// Call controller method through the wrapper
			// Controllers are registered with their route wrapper functions
			// which handle the actual method invocation
			return this.invokeController(controller, method, path, request);
		};
	}

	/**
	 * Get or create controller for a path
	 * Controllers are cached after first load
	 */
	private async getController(path: string): Promise<LazyController<any> | null> {
		// Determine base path (e.g., /api/tasks/:id → /api/tasks)
		const basePath = this.getBasePath(path);

		// Check cache
		if (this.controllersCache.has(basePath)) {
			return this.controllersCache.get(basePath)!;
		}

		// Load controller based on base path
		const controller = await this.loadController(basePath);

		if (controller) {
			this.controllersCache.set(basePath, controller);
		}

		return controller;
	}

	/**
	 * Extract base path from full path
	 * /api/tasks/:id → /api/tasks
	 * /api/tasks → /api/tasks
	 * /api/auth/session → /api/auth
	 * /api/workspaces/ → /api/workspaces
	 */
	private getBasePath(path: string): string {
		// Remove trailing slash first
		let basePath = path.replace(/\/$/, '');

		// Remove parameter segments (e.g., /:id)
		basePath = basePath.replace(/\/:[^/]+/g, '');

		// Extract first two segments (/api/resource)
		// Match /api/xxx but stop before any subsequent paths
		const match = basePath.match(/^(\/api\/[^/]+)/);
		if (match) {
			return match[1];
		}

		// Fallback: return the path without trailing slash
		return basePath;
	}

	/**
	 * Load controller dynamically based on base path
	 * Uses factory to get service dependencies
	 */
	private async loadController(basePath: string): Promise<LazyController<any> | null> {
		// Map base paths to controllers
		switch (basePath) {
			case '/api/auth':
				return this.factory.getAuthController();
			case '/api/tasks':
				return this.factory.getTasksController();
			case '/api/workers':
				return this.factory.getWorkersController();
			case '/api/workspaces':
				return this.factory.getWorkspacesController();
			case '/api/dashboard':
				return this.factory.getDashboardController();
			case '/api/ingredients':
				return this.factory.getIngredientsController();
			case '/api/books':
				return this.factory.getBooksController();
			case '/api/monitoring':
				return this.factory.getMonitoringController();
			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	/**
	 * Invoke controller method
	 * Simulates the Fastify request/reply context for controllers
	 */
	private async invokeController(
		controller: LazyController<any>,
		method: HttpMethod,
		path: string,
		request: TransportRequest
	): Promise<any> {
		// Controllers use configureRoutes with a RouteWrapperFunc
		// We need to simulate that environment

		let result: any = null;
		let error: Error | null = null;

		// Create a mock "add" function that captures the route handler
		const add = (routeMethod: HttpMethod, routePath: string, handler: any) => {
			if (routeMethod === method && routePath === path) {
				// Found matching route, invoke handler
				const mockRequest = {
					query: request.query || {},
					params: request.params || {},
					body: request.body,
					headers: request.headers || {},
					cookies: (request as any).cookies || {},
					// Add userId from request context (set by WebSocketTransportServer)
					userId: (request as any).userId,
				};

				const mockReply = {
					code: (_statusCode: number) => mockReply,
					send: (data: any) => {
						result = data;
						return mockReply;
					},
					setCookie: () => mockReply,
					clearCookie: () => mockReply,
				};

				// Invoke handler
				Promise.resolve(handler({ ...mockRequest, reply: mockReply }))
					.then(data => {
						if (result === null) {
							result = data;
						}
					})
					.catch(err => {
						error = err;
					});
			}
		};

		// Call configureRoutes to set up the route
		controller.configureRoutes(add as any);

		// Wait for handler to complete (if async)
		// Since we're not using actual async/await in the add function,
		// we need a small delay to let promises resolve
		await new Promise(resolve => setTimeout(resolve, 0));

		if (error) {
			throw error;
		}

		return result;
	}

	/**
	 * Handle incoming TransportRequest
	 * Routes to appropriate controller and returns TransportResponse
	 *
	 * @param request - Transport request
	 * @returns Transport response
	 */
	async handleRequest(request: TransportRequest): Promise<TransportResponse> {
		try {
			// Find matching route
			const route = this.findRoute(request.method, request.path);

			if (!route) {
				return {
					id: request.id,
					status: 404,
					error: {
						code: 'NOT_FOUND',
						message: `Route not found: ${request.method} ${request.path}`,
					},
					timestamp: Date.now(),
				};
			}

			// Extract params from path
			const params = this.extractParams(request.path, route.pattern, route.paramNames);

			// Add params to request
			request.params = { ...params, ...request.params };

			// Invoke handler
			const body = await route.handler(request);

			return {
				id: request.id,
				status: 200,
				body,
				timestamp: Date.now(),
			};
		} catch (err: any) {
			log.error('Request error:', err);

			return {
				id: request.id,
				status: err.statusCode || 500,
				error: {
					code: err.code || 'INTERNAL_ERROR',
					message: String(err) || 'Internal server error',
					details: err.details,
				},
				timestamp: Date.now(),
			};
		}
	}

	/**
	 * Find route matching method and path
	 */
	private findRoute(method: HttpMethod, path: string): RouteEntry | null {
		return this.routes.find(route => route.method === method && route.pattern.test(path)) || null;
	}

	/**
	 * Extract params from path using regex pattern
	 *
	 * @example
	 * path: '/api/tasks/task-123'
	 * pattern: /^\/api\/tasks\/([^/]+)$/
	 * paramNames: ['id']
	 * → { id: 'task-123' }
	 */
	private extractParams(path: string, pattern: RegExp, paramNames: string[]): Record<string, string> {
		const match = pattern.exec(path);

		if (!match) {
			return {};
		}

		const params: Record<string, string> = {};

		paramNames.forEach((name, index) => {
			params[name] = match[index + 1]; // match[0] is full match, params start at [1]
		});

		return params;
	}
}
