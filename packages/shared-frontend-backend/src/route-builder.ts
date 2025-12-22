import type { z } from 'zod';

/**
 * HTTP Methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Contract for a single route (one HTTP method on one path)
 */
export type RouteContract = {
	params?: z.ZodTypeAny;
	query?: z.ZodTypeAny;
	body?: z.ZodTypeAny;
	response: z.ZodTypeAny;
};

/**
 * Routes organized by HTTP method for a single path
 * Example: { GET: {...}, POST: {...} }
 */
export type PathRoutes = Partial<Record<HttpMethod, RouteContract>>;

export type ApiUrl = string;

/**
 * Complete API routes structure: path > method > contract
 * Example:
 * {
 *   '/api/books': { GET: {...}, POST: {...} },
 *   '/api/books/:id': { GET: {...}, PUT: {...}, DELETE: {...} }
 * }
 */
export type ApiRoutes = Record<ApiUrl, PathRoutes>;

/**
 * Builder function to define routes with type validation and automatic baseUrl calculation
 *
 * Usage:
 *   export const BOOKS_API_ROUTES = defineRoutes({
 *     '/api/books': {
 *       GET: { query: QuerySchema, response: ListSchema },
 *       POST: { body: CreateSchema, response: ItemSchema }
 *     }
 *   });
 *
 * Benefits:
 * - Clean syntax (no need for "as const satisfies")
 * - Full type inference preserved
 * - Validates structure at compile time
 * - Automatic baseUrl calculation from first route
 * - Extensible (can add runtime validation if needed)
 */
export function defineRoutes<const T extends ApiRoutes>(routes: T): T & { __baseUrl: string } {
	const paths = Object.keys(routes);

	if (paths.length === 0) {
		throw new Error('defineRoutes: routes object cannot be empty');
	}

	// Strategy: find the longest common prefix of all routes by comparing path segments
	// This handles cases like:
	// - ['/api/auth/login', '/api/auth/refresh'] → '/api/auth'
	// - ['/api/books/', '/api/books/:id'] → '/api/books'
	// - ['/api/ingredients/', '/api/ingredients/:id'] → '/api/ingredients'

	// Normalize paths: remove params and trailing slashes
	const normalizedPaths = paths.map(p => p.replace(/\/:[^/]+.*$/, '').replace(/\/$/, ''));

	// Split first path into segments
	const firstSegments = normalizedPaths[0].split('/').filter(s => s !== '');

	// If there's only one route, reconstruct the path
	if (normalizedPaths.length === 1) {
		const result = '/' + firstSegments.join('/');
		return Object.assign(routes, { __baseUrl: result });
	}

	// Find common segments across all paths
	const commonSegments: string[] = [];

	for (let i = 0; i < firstSegments.length; i++) {
		const segment = firstSegments[i];

		// Check if this segment is present at the same position in all paths
		const allHaveSegment = normalizedPaths.every(path => {
			const segments = path.split('/').filter(s => s !== '');
			return segments[i] === segment;
		});

		if (allHaveSegment) {
			commonSegments.push(segment);
		} else {
			break; // Stop at first non-common segment
		}
	}

	// Reconstruct baseUrl from common segments
	const baseUrl = commonSegments.length > 0 ? '/' + commonSegments.join('/') : '/';

	// In development mode, verify no route is shorter than the first one
	// and that base routes come before parameterized versions
	if (process.env.NODE_ENV === 'development') {
		const firstRouteHasParams = paths[0].includes(':');

		// Normalize baseUrl for comparison (remove trailing slash)
		const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

		const problematicRoute = paths.find(path => {
			const pathWithoutParams = path.replace(/\/:[^/]+.*$/, '');
			const normalizedPath = pathWithoutParams.replace(/\/$/, '');

			// Route is shorter than baseUrl (ignoring trailing slashes)
			if (normalizedPath.length < normalizedBaseUrl.length) {
				return true;
			}

			// First route has params, but this route equals the base without params
			if (firstRouteHasParams && normalizedPath === normalizedBaseUrl && !path.includes(':')) {
				return true;
			}

			return false;
		});

		if (problematicRoute) {
			throw new Error(
				`Route ordering issue in defineRoutes!\n` +
					`First route: "${paths[0]}" → baseUrl: "${baseUrl}"\n` +
					`Found shorter route: "${problematicRoute}"\n` +
					`Fix: Ensure the base route (without params) is listed first.`
			);
		}
	}

	return Object.assign(routes, { __baseUrl: baseUrl });
}
