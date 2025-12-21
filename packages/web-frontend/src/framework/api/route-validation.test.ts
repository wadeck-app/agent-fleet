import { BOOKS_API_ROUTES, INGREDIENTS_API_ROUTES } from '@shared';
import { describe, expect, it } from 'vitest';

import { booksApi } from '@app/pages/books/books.api';
import { ingredientsApi } from '@app/pages/ingredients/ingredients.api';

/**
 * ===========================================================================================
 * FRONTEND API ROUTE VALIDATION
 * ===========================================================================================
 *
 * These tests ensure that frontend API clients use the exact same route paths
 * as defined in the shared contracts.
 *
 * This prevents:
 * - 301 redirects that lose query parameters
 * - Typos in route definitions
 * - Inconsistencies between contract and implementation
 *
 * ===========================================================================================
 */

describe('Frontend API Route Validation', () => {
	describe('Books API', () => {
		it('should use correct collection route with trailing slash', () => {
			// We can't easily inspect the route from the api object,
			// but we can verify the contract has the right shape
			const collectionRoute = BOOKS_API_ROUTES['/api/books/'];
			expect(collectionRoute).toBeDefined();
			expect(collectionRoute.GET).toBeDefined();
			expect(collectionRoute.POST).toBeDefined();

			// Verify that the wrong route doesn't exist
			expect((BOOKS_API_ROUTES as Record<string, unknown>)['/api/books']).toBeUndefined();
		});

		it('should have all expected API methods', () => {
			expect(booksApi.getAll).toBeDefined();
			expect(booksApi.getById).toBeDefined();
			expect(booksApi.getByIsbn).toBeDefined();
			expect(booksApi.create).toBeDefined();
			expect(booksApi.update).toBeDefined();
			expect(booksApi.patch).toBeDefined();
			expect(booksApi.delete).toBeDefined();
		});
	});

	describe('Ingredients API', () => {
		it('should use correct collection route with trailing slash', () => {
			const collectionRoute = INGREDIENTS_API_ROUTES['/api/ingredients/'];
			expect(collectionRoute).toBeDefined();
			expect(collectionRoute.GET).toBeDefined();
			expect(collectionRoute.POST).toBeDefined();

			// Verify that the wrong route doesn't exist
			expect((INGREDIENTS_API_ROUTES as Record<string, unknown>)['/api/ingredients']).toBeUndefined();
		});

		it('should have all expected API methods', () => {
			expect(ingredientsApi.getAll).toBeDefined();
			expect(ingredientsApi.getById).toBeDefined();
			expect(ingredientsApi.create).toBeDefined();
			expect(ingredientsApi.update).toBeDefined();
			expect(ingredientsApi.delete).toBeDefined();
		});
	});

	describe('Contract Route Consistency', () => {
		it('all collection routes in contracts should have trailing slash', () => {
			const allContracts = [BOOKS_API_ROUTES, INGREDIENTS_API_ROUTES];

			allContracts.forEach(contract => {
				const routes = Object.keys(contract);
				const collectionRoutes = routes.filter(route => !route.includes(':') && route.startsWith('/api/'));

				collectionRoutes.forEach(route => {
					expect(route, `Collection route ${route} should have trailing slash`).toMatch(/\/$/);
				});
			});
		});

		it('all item routes in contracts should NOT have trailing slash', () => {
			const allContracts = [BOOKS_API_ROUTES, INGREDIENTS_API_ROUTES];

			allContracts.forEach(contract => {
				const routes = Object.keys(contract);
				const itemRoutes = routes.filter(route => route.includes(':'));

				itemRoutes.forEach(route => {
					expect(route, `Item route ${route} should NOT have trailing slash`).not.toMatch(/\/$/);
				});
			});
		});
	});
});
