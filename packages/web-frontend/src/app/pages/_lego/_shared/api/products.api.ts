import { createApiClient, createTypedFetch } from '@framework/api/api-base';
import { PRODUCTS_API_ROUTES, type ProductsListQuery } from '@shared/api/products.contract';

/**
 * ===========================================================================================
 * PRODUCTS API CLIENT - Typed API Functions
 * ===========================================================================================
 *
 * Provides typed API client functions for product operations.
 * Uses PRODUCTS_API_ROUTES contract for full type safety.
 *
 * Pattern:
 * - createApiClient for standard CRUD operations
 * - createTypedFetch for custom operations with query params
 *
 * Usage:
 * ```tsx
 * const products = await productsApi.getAll({ page: 1, pageSize: 10 });
 * const product = await productsApi.getById('123');
 * const newProduct = await productsApi.create(data);
 * const updated = await productsApi.update('123', data);
 * await productsApi.delete('123');
 * await productsApi.bulkDelete(['123', '456']);
 * ```
 *
 * ===========================================================================================
 */

const api = createApiClient(PRODUCTS_API_ROUTES);
const typedFetch = createTypedFetch(PRODUCTS_API_ROUTES);

export const productsApi = {
	/**
	 * Get all products with optional query parameters
	 */
	getAll: (query?: ProductsListQuery) => typedFetch('GET', '/api/products/', { query }),

	/**
	 * Get a single product by ID
	 */
	getById: api.byId('GET', '/api/products/:id'),

	/**
	 * Create a new product
	 */
	create: api.mutate('POST', '/api/products/'),

	/**
	 * Update an existing product
	 */
	update: api.mutateById('PUT', '/api/products/:id'),

	/**
	 * Delete a product by ID
	 */
	delete: api.byId('DELETE', '/api/products/:id'),

	/**
	 * Bulk delete multiple products
	 */
	bulkDelete: (ids: string[]) =>
		typedFetch('DELETE', '/api/products/', {
			body: { ids },
		}),
} as const;
