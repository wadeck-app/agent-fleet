import type { PRODUCTS_API_ROUTES } from '@app/shared/api/products.contract';
import { PRODUCTS_API_ROUTES as routes } from '@app/shared/api/products.contract';

import type { ProductsService } from '../services/ProductsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * PRODUCTS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for products.
 * Responsibilities:
 * - HTTP request/response handling
 * - Route definition
 * - Input validation (via Zod schemas in contracts)
 * - Delegate to service layer
 *
 * Does NOT contain:
 * - Business logic (in service)
 * - Data access (in repository)
 *
 * ===========================================================================================
 */
export default class ProductsController implements LazyController<typeof PRODUCTS_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: ProductsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof PRODUCTS_API_ROUTES>) {
		/**
		 * GET /api/products/
		 * List all products with optional filters
		 */
		add('GET', '/api/products/', async ({ query }) => {
			return this.service.list(query);
		});

		/**
		 * GET /api/products/:id
		 * Get a product by ID
		 */
		add('GET', '/api/products/:id', async ({ params }) => {
			return this.service.getById(params.id);
		});

		/**
		 * POST /api/products/
		 * Create a new product
		 */
		add('POST', '/api/products/', async ({ body }) => {
			return this.service.create(body);
		});

		/**
		 * DELETE /api/products/
		 * Bulk delete products (up to 10 per batch)
		 */
		add('DELETE', '/api/products/', async ({ body }) => {
			return this.service.bulkDelete(body.ids);
		});

		/**
		 * PUT /api/products/:id
		 * Update an existing product
		 */
		add('PUT', '/api/products/:id', async ({ params, body }) => {
			return this.service.update(params.id, body);
		});

		/**
		 * DELETE /api/products/:id
		 * Delete a product
		 */
		add('DELETE', '/api/products/:id', async ({ params }) => {
			await this.service.delete(params.id);
			return { success: true, id: params.id };
		});
	}
}
