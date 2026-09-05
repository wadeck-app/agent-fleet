/**
 * ===========================================================================================
 * ROUTE VALIDATION HELPER
 * ===========================================================================================
 *
 * Validates route definitions at runtime to ensure consistency.
 *
 * Rules:
 * 1. Collection routes (without parameters) MUST have trailing slash
 * 2. Item routes (with :id or other params) MUST NOT have trailing slash
 * 3. Prevents 301 redirects that lose query parameters
 *
 * Usage:
 *   import { validateRoutes } from '@app/shared/utils/validate-routes';
 *   validateRoutes(MY_API_ROUTES, 'MY_API');
 *
 * ===========================================================================================
 */

export interface ValidationError {
	route: string;
	error: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

/**
 * Validate that route definitions follow the trailing slash convention
 *
 * @param routes - The route definitions object
 * @param name - Name of the API for error messages
 * @returns Validation result with any errors found
 */
export function validateRoutes(routes: Record<string, any>, _name: string = 'API'): ValidationResult {
	const errors: ValidationError[] = [];
	const routePaths = Object.keys(routes);

	for (const route of routePaths) {
		// Skip non-API routes
		if (!route.startsWith('/api/')) {
			continue;
		}

		const hasParams = route.includes(':');
		const hasTrailingSlash = route.endsWith('/');

		// Collection routes must have trailing slash
		if (!hasParams && !hasTrailingSlash) {
			errors.push({
				route,
				error: `Collection route "${route}" must have trailing slash. Use "${route}/" instead.`,
			});
		}

		// Item routes must NOT have trailing slash
		if (hasParams && hasTrailingSlash) {
			errors.push({
				route,
				error: `Item route "${route}" must NOT have trailing slash. Use "${route.slice(0, -1)}" instead.`,
			});
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Assert that routes are valid, throwing an error if not
 *
 * @param routes - The route definitions object
 * @param name - Name of the API for error messages
 * @throws Error if validation fails
 */
export function assertValidRoutes(routes: Record<string, any>, name: string = 'API'): void {
	const result = validateRoutes(routes, name);

	if (!result.valid) {
		const errorMessages = result.errors.map(err => `  - ${err.error}`).join('\n');

		throw new Error(
			`\n Route validation failed for ${name}:\n${errorMessages}\n\n` +
				`Routes must follow the trailing slash convention:\n` +
				`  • Collection routes (no params): /api/books/\n` +
				`  • Item routes (with params): /api/books/:id\n`
		);
	}
}

/**
 * Log validation warnings without throwing (useful for development)
 *
 * @param routes - The route definitions object
 * @param name - Name of the API for error messages
 */
export function warnInvalidRoutes(routes: Record<string, any>, name: string = 'API'): void {
	const result = validateRoutes(routes, name);

	if (!result.valid) {
		console.warn(`\n  Route validation warnings for ${name}:`);
		result.errors.forEach(err => {
			console.warn(`  - ${err.error}`);
		});
		console.warn('');
	}
}
