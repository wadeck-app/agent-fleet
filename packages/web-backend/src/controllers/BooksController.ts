import type { BOOKS_API_ROUTES } from '@app/shared';
import { BOOKS_API_ROUTES as routes } from '@app/shared';

import type { BooksService } from '../services/BooksService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

//console.warn('BooksController imported');

/**
 * ===========================================================================================
 * BOOKS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for books.
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
export default class BooksController implements LazyController<typeof BOOKS_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: BooksService) {
		//console.warn('BooksController created');
		//console.log('[CONTROLLER] BooksController instance created');
	}

	configureRoutes(add: RouteWrapperFunc<typeof BOOKS_API_ROUTES>) {
		/**
		 * GET /api/books/
		 * List all books with optional filters
		 */
		add('GET', '/api/books/', async ({ query }) => {
			return this.service.list(query);
		});

		/**
		 * GET /api/books/:id
		 * Get a book by ID
		 */
		add('GET', '/api/books/:id', async ({ params }) => {
			return this.service.getById(params.id);
		});

		/**
		 * GET /api/books/isbn/:isbn
		 * Check if ISBN exists and return the book
		 */
		add('GET', '/api/books/isbn/:isbn', async ({ params, query }) => {
			return this.service.getByISBN(params.isbn, query?.excludeBookId);
		});

		/**
		 * POST /api/books/
		 * Create a new book
		 */
		add('POST', '/api/books/', async ({ body }) => {
			return this.service.create(body);
		});

		/**
		 * DELETE /api/books/
		 * Bulk delete books (up to 10 per batch)
		 */
		add('DELETE', '/api/books/', async ({ body }) => {
			return this.service.bulkDelete(body.ids);
		});

		/**
		 * PUT /api/books/:id
		 * Update an existing book
		 */
		add('PUT', '/api/books/:id', async ({ params, body }) => {
			return this.service.update(params.id, body);
		});

		/**
		 * PATCH /api/books/:id
		 * Partially update a book (merge changes with version check)
		 */
		add('PATCH', '/api/books/:id', async ({ params, body }) => {
			return this.service.partialUpdate(params.id, body);
		});

		/**
		 * DELETE /api/books/:id
		 * Delete a book
		 */
		add('DELETE', '/api/books/:id', async ({ params }) => {
			await this.service.delete(params.id);
			return { success: true, id: params.id };
		});
	}
}
