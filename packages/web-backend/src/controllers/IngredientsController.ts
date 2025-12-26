import type { INGREDIENTS_API_ROUTES } from '@app/shared/api/ingredients.contract';
import { INGREDIENTS_API_ROUTES as routes } from '@app/shared/api/ingredients.contract';

import type { IngredientsService } from '../services/IngredientsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * INGREDIENTS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for ingredients.
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
export default class IngredientsController implements LazyController<typeof INGREDIENTS_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: IngredientsService) {
		//console.log('[CONTROLLER] IngredientsController instance created');
	}

	configureRoutes(add: RouteWrapperFunc<typeof INGREDIENTS_API_ROUTES>) {
		/**
		 * GET /api/ingredients/
		 * List all ingredients with optional filters
		 */
		add('GET', '/api/ingredients/', async ({ query }) => {
			return this.service.list(query);
		});

		/**
		 * GET /api/ingredients/:id
		 * Get an ingredient by ID
		 */
		add('GET', '/api/ingredients/:id', async ({ params }) => {
			return this.service.getById(params.id);
		});

		/**
		 * POST /api/ingredients/
		 * Create a new ingredient
		 */
		add('POST', '/api/ingredients/', async ({ body }) => {
			return this.service.create(body);
		});

		/**
		 * DELETE /api/ingredients/
		 * Bulk delete ingredients (up to 10 per batch)
		 */
		add('DELETE', '/api/ingredients/', async ({ body }) => {
			return this.service.bulkDelete(body.ids);
		});

		/**
		 * PUT /api/ingredients/:id
		 * Update an existing ingredient
		 */
		add('PUT', '/api/ingredients/:id', async ({ params, body }) => {
			return this.service.update(params.id, body);
		});

		/**
		 * PATCH /api/ingredients/:id
		 * Partially update an ingredient (merge changes with version check)
		 */
		add('PATCH', '/api/ingredients/:id', async ({ params, body }) => {
			return this.service.partialUpdate(params.id, body);
		});

		/**
		 * DELETE /api/ingredients/:id
		 * Delete an ingredient
		 */
		add('DELETE', '/api/ingredients/:id', async ({ params }) => {
			await this.service.delete(params.id);
			return { success: true, id: params.id };
		});
	}
}
