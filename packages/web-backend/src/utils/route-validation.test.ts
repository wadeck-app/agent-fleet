import { describe, expect, it } from 'vitest';

import { BOOKS_API_ROUTES } from '@app/shared/api/books.contract';
import { INGREDIENTS_API_ROUTES } from '@app/shared/api/ingredients.contract';

/**
 * ===========================================================================================
 * ROUTE VALIDATION TESTS
 * ===========================================================================================
 *
 * These tests ensure consistency between contract definitions, backend controllers,
 * and frontend API clients.
 *
 * Rules:
 * 1. Collection routes (GET list, POST create) MUST have trailing slash: /api/books/
 * 2. Item routes (GET/PUT/PATCH/DELETE by ID) MUST NOT have trailing slash: /api/books/:id
 * 3. Prevents 301 redirects that lose query parameters
 *
 * ===========================================================================================
 */

describe('Route Validation', () => {
	describe('Books Routes', () => {
		it('should have trailing slash for collection routes', () => {
			const routes = Object.keys(BOOKS_API_ROUTES);

			// Collection route must have trailing slash
			expect(routes).toContain('/api/books/');
			expect(routes).not.toContain('/api/books');
		});

		it('should NOT have trailing slash for item routes', () => {
			const routes = Object.keys(BOOKS_API_ROUTES);

			// Item routes must NOT have trailing slash
			const itemRoutes = routes.filter(r => r.includes(':id'));
			itemRoutes.forEach(route => {
				expect(route).not.toMatch(/\/$/);
			});
		});

		it('should have GET and POST methods on collection route', () => {
			const collectionRoute = BOOKS_API_ROUTES['/api/books/'];
			expect(collectionRoute).toBeDefined();
			expect(collectionRoute.GET).toBeDefined();
			expect(collectionRoute.POST).toBeDefined();
		});
	});

	describe('Ingredients Routes', () => {
		it('should have trailing slash for collection routes', () => {
			const routes = Object.keys(INGREDIENTS_API_ROUTES);

			// Collection route must have trailing slash
			expect(routes).toContain('/api/ingredients/');
			expect(routes).not.toContain('/api/ingredients');
		});

		it('should NOT have trailing slash for item routes', () => {
			const routes = Object.keys(INGREDIENTS_API_ROUTES);

			// Item routes must NOT have trailing slash
			const itemRoutes = routes.filter(r => r.includes(':id'));
			itemRoutes.forEach(route => {
				expect(route).not.toMatch(/\/$/);
			});
		});

		it('should have GET and POST methods on collection route', () => {
			const collectionRoute = INGREDIENTS_API_ROUTES['/api/ingredients/'];
			expect(collectionRoute).toBeDefined();
			expect(collectionRoute.GET).toBeDefined();
			expect(collectionRoute.POST).toBeDefined();
		});
	});

	describe('General Route Conventions', () => {
		it('all collection routes should end with trailing slash', () => {
			const allRoutes = [...Object.keys(BOOKS_API_ROUTES), ...Object.keys(INGREDIENTS_API_ROUTES)];

			// Collection routes are those without parameters
			const collectionRoutes = allRoutes.filter(route => !route.includes(':') && route.startsWith('/api/'));

			collectionRoutes.forEach(route => {
				expect(route).toMatch(/\/$/);
			});
		});

		it('all item routes should NOT end with trailing slash', () => {
			const allRoutes = [...Object.keys(BOOKS_API_ROUTES), ...Object.keys(INGREDIENTS_API_ROUTES)];

			// Item routes are those with parameters
			const itemRoutes = allRoutes.filter(route => route.includes(':'));

			itemRoutes.forEach(route => {
				expect(route).not.toMatch(/\/$/);
			});
		});
	});
});
