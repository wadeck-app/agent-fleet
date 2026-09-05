import type { HttpMethod } from '@shared/route-builder';
import type { PathsForMethod, RouteBody, RouteParams, RouteQuery, RouteResponse } from '@shared/types';

import { getConnId } from '@/transport/connection-id';

import { API_BASE_URL } from '@app/api/config';
import { circuitBreakerService } from '@app/services';

/**
 * ===========================================================================================
 * FRONTEND VALIDATION MODES
 * ===========================================================================================
 *
 * Configurable validation mode on frontend side
 *
 * - 'warn' (DEFAULT): Validates data and displays a warning in console if invalid,
 *                     but continues execution. Perfect for development.
 *
 * - 'throw': Throws an exception if data is invalid. Stops execution.
 *            Useful for tests or strict production.
 *
 * - 'silent': Completely disables frontend validation. Maximum performance.
 *             Server always validates (security guaranteed).
 *
 * Usage:
 *   typedFetch('GET', '/api/ingredients', { query: {...}, validationMode: 'warn' });
 *
 * Note: The server ALWAYS validates data, so security is guaranteed even in
 * 'silent' mode. Frontend validation is a bonus to detect bugs earlier.
 */
export type ValidationMode = 'throw' | 'warn' | 'silent';

/**
 * Global validation configuration
 * Default: 'warn' for good development/production balance
 */
let globalValidationMode: ValidationMode = 'warn';

/**
 * Configure the global validation mode for all typedFetch calls
 *
 * @param mode The validation mode to use
 */
export function setValidationMode(mode: ValidationMode): void {
	globalValidationMode = mode;
}

/**
 * Get the current global validation mode
 */
export function getValidationMode(): ValidationMode {
	return globalValidationMode;
}

/**
 * Custom error for API errors
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}

	/**
	 * Get user-friendly error message including validation details
	 */
	getUserMessage(): string {
		// If we have validation details, show only the detailed messages (skip generic "Validation failed")
		if (this.details && Array.isArray(this.details) && this.details.length > 0) {
			const detailMessages = this.details
				.map((detail: unknown) => {
					// Handle Zod validation errors (with path array)
					const d = detail as { path?: string[] | string; field?: string; message?: string };
					// Extract field name from path array/string or field property
					let fieldName: string | undefined;
					if (d.path) {
						// path can be either string[] or string
						fieldName = Array.isArray(d.path) ? d.path.join('.') : d.path;
					} else if (d.field) {
						fieldName = d.field;
					}
					if (fieldName && d.message) {
						return `${fieldName}: ${d.message}`;
					}
					return d.message || JSON.stringify(detail);
				})
				.join('\n');
			// Return only the detailed messages, not the generic error message
			return detailMessages;
		}
		return this.message;
	}
}

/**
 * Helper to build a URL with route parameters and query strings
 */
export function buildUrl(
	path: string,
	options?: {
		params?: Record<string, string | number>;
		query?: Record<string, string | number | undefined>;
	}
): string {
	let url = path as string;

	// @formatter:off
	// Replace route parameters (:id => value)
	// @formatter:on
	if (options?.params) {
		for (const [key, value] of Object.entries(options.params)) {
			url = url.replace(`:${key}`, String(value));
		}
	}

	// Build the full URL
	const fullUrl = new URL(url, API_BASE_URL);

	// Add query parameters
	if (options?.query) {
		for (const [key, value] of Object.entries(options.query)) {
			if (value !== undefined) {
				fullUrl.searchParams.append(key, String(value));
			}
		}
	}

	return fullUrl.toString();
}

/**
 * Helper to validate data with the configured mode
 */
export function validateWithMode<T>(
	schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } },
	data: unknown,
	context: string,
	mode: ValidationMode
): T {
	if (mode === 'silent') {
		return data as T;
	}

	const result = schema.safeParse(data);

	if (!result.success) {
		// Type guard for result.error
		const errorMessage =
			result.error && typeof result.error === 'object' && 'message' in result.error
				? String((result.error as { message: unknown }).message)
				: 'Validation failed';
		const message = `[Validation ${context}] ${errorMessage}`;

		if (mode === 'throw') {
			throw new Error(message);
		}

		if (mode === 'warn') {
			const errorDetails =
				result.error && typeof result.error === 'object' && 'issues' in result.error
					? (result.error as { issues: unknown }).issues
					: result.error;
			console.warn(` ${message}`, errorDetails);
			return data as T;
		}
	}

	return result.data as T;
}

/**
 * Options for typedFetch
 */
export type TypedFetchOptions<M extends HttpMethod, P extends string, Routes = Record<string, unknown>> = {
	params?: RouteParams<M, P, Routes>;
	query?: RouteQuery<M, P, Routes>;
	body?: RouteBody<M, P, Routes>;
	validationMode?: ValidationMode;
};

/**
 * ===========================================================================================
 * FACTORY TO CREATE A TYPED CLIENT FOR A SET OF ROUTES
 * ===========================================================================================
 *
 * This factory function creates a typedFetch function specific to a set of routes.
 * This allows having multiple API clients (ingredients, books, etc.) with the same pattern.
 */
export function createTypedFetch<Routes extends Record<string, unknown>>(routes: Routes) {
	return async function typedFetch<M extends HttpMethod, P extends PathsForMethod<M, Routes>>(
		method: M,
		path: P,
		options?: TypedFetchOptions<M, P, Routes>
	): Promise<RouteResponse<M, P, Routes>> {
		// New structure: apiRoute > httpMethod > request/response types
		const contract = (routes as Record<string, Record<string, unknown>>)[path]?.[method] as
			| {
					params?: {
						safeParse: (data: unknown) => {
							success: boolean;
							data?: unknown;
							error?: unknown;
						};
					};
					query?: {
						safeParse: (data: unknown) => {
							success: boolean;
							data?: unknown;
							error?: unknown;
						};
					};
					body?: {
						safeParse: (data: unknown) => {
							success: boolean;
							data?: unknown;
							error?: unknown;
						};
					};
					response: {
						safeParse: (data: unknown) => {
							success: boolean;
							data?: unknown;
							error?: unknown;
						};
					};
			  }
			| undefined;

		if (!contract) {
			throw new Error(`No contract found for ${method} ${path}`);
		}

		// Validation mode (use global mode by default)
		const validationMode = options?.validationMode ?? globalValidationMode;

		// Validate request parameters according to configured mode
		if (options?.params && contract.params) {
			options.params = validateWithMode(
				contract.params,
				options.params,
				'Request params',
				validationMode
			) as RouteParams<M, P, Routes>;
		}

		if (options?.query && contract.query) {
			options.query = validateWithMode(
				contract.query,
				options.query,
				'Request query',
				validationMode
			) as RouteQuery<M, P, Routes>;
		}

		if (options?.body && contract.body) {
			options.body = validateWithMode(contract.body, options.body, 'Request body', validationMode) as RouteBody<
				M,
				P,
				Routes
			>;
		}

		// Build the URL
		const url = buildUrl(path, options);

		// Get connId for request correlation (unique per tab, even for duplicated tabs)
		const connId = getConnId();

		// Build headers object
		const headers: Record<string, string> = {};
		if (options?.body) {
			headers['Content-Type'] = 'application/json';
		}
		// Always send connId (unique per tab)
		headers['X-Conn-Id'] = connId;

		// Execute the request
		const response = await circuitBreakerService.executeFetch(url, {
			method,
			headers,
			body: options?.body ? JSON.stringify(options.body) : undefined,
		});

		// Handle HTTP errors
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new ApiError(
				errorData.error || `HTTP ${response.status}: ${response.statusText}`,
				response.status,
				errorData.details
			);
		}

		// Validate response according to configured mode
		const data = await response.json();
		const validatedData = validateWithMode(contract.response, data, 'Response', validationMode);

		return validatedData as RouteResponse<M, P, Routes>;
	};
}

/**
 * ===========================================================================================
 * HELPER FUNCTIONS FOR COMMON API OPERATIONS
 * ===========================================================================================
 *
 * These helpers eliminate URL duplication in API method definitions.
 * Each URL is defined once and used both for typing and execution.
 *
 * Benefits:
 * - Zero URL duplication (define once, use everywhere)
 * - Full type safety maintained
 * - 50% less code per API file
 * - Clear, explicit method structure
 *
 * ===========================================================================================
 */

/**
 * Create GET list operation (for /api/resources)
 */
export function createListGetter<Routes extends Record<string, unknown>, Path extends string>(
	typedFetch: ReturnType<typeof createTypedFetch<Routes>>,
	path: Path
) {
	return (
		query?: RouteQuery<'GET', Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<'GET', Path, Routes>> =>
		typedFetch('GET', path as unknown as PathsForMethod<'GET', Routes>, {
			query: query as unknown as RouteQuery<'GET', PathsForMethod<'GET', Routes>, Routes>,
			validationMode,
		});
}

/**
 * Create GET by ID operation (for /api/resources/:id)
 */
export function createByIdGetter<Routes extends Record<string, unknown>, Path extends string>(
	typedFetch: ReturnType<typeof createTypedFetch<Routes>>,
	path: Path
) {
	return (id: string, validationMode?: ValidationMode): Promise<RouteResponse<'GET', Path, Routes>> =>
		typedFetch('GET', path as unknown as PathsForMethod<'GET', Routes>, {
			params: { id } as unknown as RouteParams<'GET', PathsForMethod<'GET', Routes>, Routes>,
			validationMode,
		});
}

/**
 * Create POST operation (for creating resources)
 */
export function createCreator<Routes extends Record<string, unknown>, Path extends string>(
	typedFetch: ReturnType<typeof createTypedFetch<Routes>>,
	path: Path
) {
	return (
		body: RouteBody<'POST', Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<'POST', Path, Routes>> =>
		typedFetch('POST', path as unknown as PathsForMethod<'POST', Routes>, {
			body: body as unknown as RouteBody<'POST', PathsForMethod<'POST', Routes>, Routes>,
			validationMode,
		});
}

/**
 * Create PUT operation (for updating resources)
 */
export function createUpdater<Routes extends Record<string, unknown>, Path extends string>(
	typedFetch: ReturnType<typeof createTypedFetch<Routes>>,
	path: Path
) {
	return (
		id: string,
		body: RouteBody<'PUT', Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<'PUT', Path, Routes>> =>
		typedFetch('PUT', path as unknown as PathsForMethod<'PUT', Routes>, {
			params: { id } as unknown as RouteParams<'PUT', PathsForMethod<'PUT', Routes>, Routes>,
			body: body as unknown as RouteBody<'PUT', PathsForMethod<'PUT', Routes>, Routes>,
			validationMode,
		});
}

/**
 * Create DELETE operation (for deleting resources)
 */
export function createDeleter<Routes extends Record<string, unknown>, Path extends string>(
	typedFetch: ReturnType<typeof createTypedFetch<Routes>>,
	path: Path
) {
	return (id: string, validationMode?: ValidationMode): Promise<RouteResponse<'DELETE', Path, Routes>> =>
		typedFetch('DELETE', path as unknown as PathsForMethod<'DELETE', Routes>, {
			params: { id } as unknown as RouteParams<'DELETE', PathsForMethod<'DELETE', Routes>, Routes>,
			validationMode,
		});
}

/**
 * ===========================================================================================
 * HELPER FUNCTIONS WITH EXPLICIT HTTP METHODS (Version 2)
 * ===========================================================================================
 *
 * These helpers include the HTTP method as a parameter for better visibility.
 * When you Ctrl+click on the URL, you see the HTTP verb right next to it.
 *
 * ===========================================================================================
 */

/**
 * Create list operation with explicit method (e.g., GET /api/resources)
 */
export function createListOperation<
	Routes extends Record<string, unknown>,
	Method extends HttpMethod,
	Path extends PathsForMethod<Method, Routes>,
>(typedFetch: ReturnType<typeof createTypedFetch<Routes>>, method: Method, path: Path) {
	return (
		query?: RouteQuery<Method, Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<Method, Path, Routes>> =>
		typedFetch(method, path as PathsForMethod<Method, Routes>, { query, validationMode });
}

/**
 * Create by-ID operation with explicit method (e.g., GET/DELETE /api/resources/:id)
 */
export function createByIdOperation<
	Routes extends Record<string, unknown>,
	Method extends HttpMethod,
	Path extends PathsForMethod<Method, Routes>,
>(typedFetch: ReturnType<typeof createTypedFetch<Routes>>, method: Method, path: Path) {
	return (id: string, validationMode?: ValidationMode): Promise<RouteResponse<Method, Path, Routes>> =>
		typedFetch(method, path as unknown as PathsForMethod<Method, Routes>, {
			params: { id } as unknown as RouteParams<Method, PathsForMethod<Method, Routes>, Routes>,
			validationMode,
		});
}

/**
 * Create mutation operation with explicit method (e.g., POST /api/resources)
 */
export function createMutationOperation<
	Routes extends Record<string, unknown>,
	Method extends HttpMethod,
	Path extends PathsForMethod<Method, Routes>,
>(typedFetch: ReturnType<typeof createTypedFetch<Routes>>, method: Method, path: Path) {
	return (
		body: RouteBody<Method, Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<Method, Path, Routes>> =>
		typedFetch(method, path as PathsForMethod<Method, Routes>, { body, validationMode });
}

/**
 * Create update operation with explicit method (e.g., PUT /api/resources/:id)
 */
export function createUpdateOperation<
	Routes extends Record<string, unknown>,
	Method extends HttpMethod,
	Path extends PathsForMethod<Method, Routes>,
>(typedFetch: ReturnType<typeof createTypedFetch<Routes>>, method: Method, path: Path) {
	return (
		id: string,
		body: RouteBody<Method, Path, Routes>,
		validationMode?: ValidationMode
	): Promise<RouteResponse<Method, Path, Routes>> =>
		typedFetch(method, path as unknown as PathsForMethod<Method, Routes>, {
			params: { id } as unknown as RouteParams<Method, PathsForMethod<Method, Routes>, Routes>,
			body,
			validationMode,
		});
}

/**
 * ===========================================================================================
 * API CLIENT BUILDER (Version 3 - Concise with Autocomplete + Explicit HTTP Methods)
 * ===========================================================================================
 *
 * Creates an API client with short, semantic method names that accept HTTP methods.
 * Provides excellent autocomplete and minimal boilerplate while keeping HTTP verbs visible.
 *
 * Usage:
 *   const api = createApiClient(BOOKS_API_ROUTES);
 *
 *   export const booksApi = {
 *     getAll: api.list('GET', '/api/books'),
 *     getById: api.byId('GET', '/api/books/:id'),
 *     create: api.mutate('POST', '/api/books'),
 *     update: api.mutateById('PUT', '/api/books/:id'),
 *     delete: api.byId('DELETE', '/api/books/:id'),
 *   };
 *
 * Benefits:
 * - Short method names with autocomplete (list, byId, mutate, mutateById)
 * - HTTP verbs explicitly visible (critical improvement!)
 * - Strongly typed URLs and methods
 * - One line per API method
 * - Clear, semantic operations
 *
 * ===========================================================================================
 */
export function createApiClient<Routes extends Record<string, unknown>>(routes: Routes) {
	const typedFetch = createTypedFetch(routes);

	return {
		/**
		 * List operation (e.g., GET /api/resources)
		 * For fetching collections
		 */
		list: <Method extends HttpMethod, Path extends PathsForMethod<Method, Routes>>(method: Method, path: Path) =>
			createListOperation(typedFetch, method, path),

		/**
		 * By-ID operation (e.g., GET /api/resources/:id, DELETE /api/resources/:id)
		 * For fetching or deleting a single resource by ID
		 */
		byId: <Method extends HttpMethod, Path extends PathsForMethod<Method, Routes>>(method: Method, path: Path) =>
			createByIdOperation(typedFetch, method, path),

		/**
		 * Mutation operation (e.g., POST /api/resources)
		 * For creating resources
		 */
		mutate: <Method extends HttpMethod, Path extends PathsForMethod<Method, Routes>>(method: Method, path: Path) =>
			createMutationOperation(typedFetch, method, path),

		/**
		 * Mutation with ID operation (e.g., PUT /api/resources/:id)
		 * For updating resources
		 */
		mutateById: <Method extends HttpMethod, Path extends PathsForMethod<Method, Routes>>(
			method: Method,
			path: Path
		) => createUpdateOperation(typedFetch, method, path),
	};
}
