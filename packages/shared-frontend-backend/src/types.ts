/**
 * ===========================================================================================
 * TYPE DEFINITIONS FOR API ROUTES
 * ===========================================================================================
 *
 * New structure: apiRoute > httpMethod > request/response types
 *
 * Benefits:
 * - Better navigation: Ctrl+click on URL shows all HTTP methods in one place
 * - More RESTful: resources with their verbs together
 * - Less duplication: each URL path appears only once as a key
 * - Easier merging: no conflicts when combining route definitions
 *
 * ===========================================================================================
 */
// Import types for use in type helpers below

/**
 * ===========================================================================================
 * ALL API ROUTES
 * ===========================================================================================
 *
 * Import contracts here (after defineRoutes is defined) to avoid circular dependencies
 *
 * ===========================================================================================
 */
import { AUTH_API_ROUTES } from './api/auth.contract';
import { BOOKS_API_ROUTES } from './api/books.contract';
import { DASHBOARD_API_ROUTES } from './api/dashboard.contract';
import { FLOWS_API_ROUTES } from './api/flows.contract';
import { INGREDIENTS_API_ROUTES } from './api/ingredients.contract';
import { MONITORING_API_ROUTES } from './api/monitoring.contract';
import { TASKS_API_ROUTES } from './api/tasks.contract';
import { WORKERS_API_ROUTES } from './api/workers.contract';
import { WORKSPACES_API_ROUTES } from './api/workspaces.contract';
import type { HttpMethod } from './route-builder';

// Re-export route builder types and function
export type { HttpMethod, RouteContract, PathRoutes, ApiUrl, ApiRoutes } from './route-builder';
export { defineRoutes } from './route-builder';

/**
 * All API routes combined
 * With the new structure, merging is trivial (no conflicts since paths are different)
 */
export const ALL_API_ROUTES = {
	...AUTH_API_ROUTES,
	...INGREDIENTS_API_ROUTES,
	...BOOKS_API_ROUTES,
	...DASHBOARD_API_ROUTES,
	...FLOWS_API_ROUTES,
	...WORKERS_API_ROUTES,
	...TASKS_API_ROUTES,
	...WORKSPACES_API_ROUTES,
	...MONITORING_API_ROUTES,
} as const;

/**
 * ===========================================================================================
 * ROUTES BY BASE URL - For backend lazy loading
 * ===========================================================================================
 *
 * Automatically maps baseUrl → routes for each contract.
 * This allows the backend to retrieve routes without importing controllers.
 *
 * Example:
 *   ROUTES_BY_BASE_URL['/api/books'] → BOOKS_API_ROUTES
 *
 * ===========================================================================================
 */
const ALL_CONTRACTS = [
	AUTH_API_ROUTES,
	INGREDIENTS_API_ROUTES,
	BOOKS_API_ROUTES,
	DASHBOARD_API_ROUTES,
	FLOWS_API_ROUTES,
	WORKERS_API_ROUTES,
	TASKS_API_ROUTES,
	WORKSPACES_API_ROUTES,
	MONITORING_API_ROUTES,
] as const;

export const ROUTES_BY_BASE_URL: Record<string, any> = Object.fromEntries(
	ALL_CONTRACTS.map(contract => [contract.__baseUrl, contract])
);

/**
 * ===========================================================================================
 * TYPE HELPERS FOR EXTRACTING ROUTE INFORMATION
 * ===========================================================================================
 *
 * These helpers extract types from the route definitions for type-safe API usage.
 * Adapted for the new structure: Routes[Path][Method] instead of Routes[Method][Path]
 *
 * ===========================================================================================
 */

/**
 * Get all paths that support a given HTTP method
 *
 * Example: PathsForMethod<'GET'> = '/api/books' | '/api/books/:id' | '/api/ingredients' | ...
 */
export type PathsForMethod<M extends HttpMethod, Routes = typeof ALL_API_ROUTES> = {
	[P in keyof Routes]: M extends keyof Routes[P] ? P : never;
}[keyof Routes] &
	string;

/**
 * Extract params type for a given method and path
 */
export type RouteParams<M extends HttpMethod, P extends string, Routes = typeof ALL_API_ROUTES> = P extends keyof Routes
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
 */
export type RouteQuery<M extends HttpMethod, P extends string, Routes = typeof ALL_API_ROUTES> = P extends keyof Routes
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
 */
export type RouteBody<M extends HttpMethod, P extends string, Routes = typeof ALL_API_ROUTES> = P extends keyof Routes
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
 */
export type RouteResponse<
	M extends HttpMethod,
	P extends string,
	Routes = typeof ALL_API_ROUTES,
> = P extends keyof Routes
	? M extends keyof Routes[P]
		? Routes[P][M] extends { response: infer Response }
			? Response extends { parse: (data: any) => infer T }
				? T
				: never
			: never
		: never
	: never;

/**
 * ===========================================================================================
 * API PATH TYPE FOR BACKEND ROUTING
 * ===========================================================================================
 *
 * Use this type to ensure URL paths in backend routing are valid API paths.
 *
 * Usage in backend/src/routes.ts:
 *   const path: ApiPath = '/api/books';  // ✅ Valid
 *   const path: ApiPath = '/api/invalid'; // ❌ Type error
 *
 * ===========================================================================================
 */
export type ApiPath = keyof typeof ALL_API_ROUTES;
