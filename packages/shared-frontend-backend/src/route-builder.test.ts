import { z } from 'zod';

import { defineRoutes } from './route-builder';
import type { ApiRoutes } from './route-builder';

describe('defineRoutes', () => {
	describe('basic functionality', () => {
		it('should return routes with __baseUrl property', () => {
			const routes = defineRoutes({
				'/api/books': {
					GET: { response: z.string() },
				},
			});

			expect(routes).toHaveProperty('__baseUrl');
			expect(routes.__baseUrl).toBe('/api/books');
		});

		it('should preserve all route definitions', () => {
			const routeDef = {
				'/api/books': {
					GET: { response: z.string() },
					POST: { body: z.object({}), response: z.string() },
				},
			};

			const routes = defineRoutes(routeDef);

			expect(routes['/api/books'].GET).toBeDefined();
			expect(routes['/api/books'].POST).toBeDefined();
		});
	});

	describe('baseUrl extraction', () => {
		it('should extract baseUrl from simple path', () => {
			const routes = defineRoutes({
				'/api/books': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/books');
		});

		it('should extract baseUrl from path with single parameter', () => {
			const routes = defineRoutes({
				'/api/books/:id': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/books');
		});

		it('should extract baseUrl from path with multiple parameters', () => {
			const routes = defineRoutes({
				'/api/books/:id/chapters/:chapterId': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/books');
		});

		it('should use first route as baseUrl when all routes have same base', () => {
			const routes = defineRoutes({
				'/api/books': {
					GET: { response: z.string() },
				},
				'/api/books/:id': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/books');
		});
	});

	describe('error handling', () => {
		it('should throw error when routes object is empty', () => {
			expect(() => {
				defineRoutes({} as ApiRoutes);
			}).toThrow('defineRoutes: routes object cannot be empty');
		});
	});

	describe('route ordering validation (development mode)', () => {
		const originalEnv = process.env.NODE_ENV;

		beforeEach(() => {
			process.env.NODE_ENV = 'development';
		});

		afterEach(() => {
			process.env.NODE_ENV = originalEnv;
		});

		it('should throw error when routes are in wrong order (shorter route after first)', () => {
			expect(() => {
				defineRoutes({
					'/api/books/:id': {
						GET: { response: z.string() },
					},
					'/api/books': {
						GET: { response: z.string() },
					},
				});
			}).toThrow(/Route ordering issue/);
		});

		it('should throw error with helpful message about route ordering', () => {
			expect(() => {
				defineRoutes({
					'/api/books/:id': {
						GET: { response: z.string() },
					},
					'/api/books': {
						GET: { response: z.string() },
					},
				});
			}).toThrow(/First route/);

			expect(() => {
				defineRoutes({
					'/api/books/:id': {
						GET: { response: z.string() },
					},
					'/api/books': {
						GET: { response: z.string() },
					},
				});
			}).toThrow(/shorter route/);
		});

		it('should throw error when a genuinely shorter route comes after first', () => {
			expect(() => {
				defineRoutes({
					'/api/v1/books/:id': {
						GET: { response: z.string() },
					},
					'/api': {
						GET: { response: z.string() },
					},
				});
			}).toThrow(/Route ordering issue/);
		});

		it('should not throw when routes are in correct order', () => {
			expect(() => {
				defineRoutes({
					'/api/books': {
						GET: { response: z.string() },
					},
					'/api/books/:id': {
						GET: { response: z.string() },
					},
				});
			}).not.toThrow();
		});

		it('should handle multiple routes with same base correctly', () => {
			const routes = defineRoutes({
				'/api/books': {
					GET: { response: z.string() },
				},
				'/api/books/:id': {
					GET: { response: z.string() },
				},
				'/api/books/:id/chapters': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/books');
		});
	});

	describe('production mode', () => {
		const originalEnv = process.env.NODE_ENV;

		beforeEach(() => {
			process.env.NODE_ENV = 'production';
		});

		afterEach(() => {
			process.env.NODE_ENV = originalEnv;
		});

		it('should not validate route ordering in production', () => {
			// Should not throw even with wrong order
			const routes = defineRoutes({
				'/api/books/:id': {
					GET: { response: z.string() },
				},
				'/api/books': {
					GET: { response: z.string() },
				},
			});

			// In production, it just uses the first route's base
			expect(routes.__baseUrl).toBe('/api/books');
		});
	});

	describe('edge cases', () => {
		it('should handle root path', () => {
			const routes = defineRoutes({
				'/': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/');
		});

		it('should handle path with trailing parameter', () => {
			const routes = defineRoutes({
				'/api/search/:query': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/search');
		});

		it('should handle path with multiple segments before parameter', () => {
			const routes = defineRoutes({
				'/api/v1/books/:id': {
					GET: { response: z.string() },
				},
			});

			expect(routes.__baseUrl).toBe('/api/v1/books');
		});
	});

	describe('type inference', () => {
		it('should preserve type information for route contracts', () => {
			const QuerySchema = z.object({ page: z.number() });
			const ResponseSchema = z.array(z.object({ id: z.string() }));

			const routes = defineRoutes({
				'/api/books': {
					GET: {
						query: QuerySchema,
						response: ResponseSchema,
					},
				},
			});

			// Type check - these should compile without errors
			type RouteType = typeof routes;
			type GetRoute = RouteType['/api/books']['GET'];

			// Verify the contracts are preserved
			expect(routes['/api/books'].GET?.query).toBe(QuerySchema);
			expect(routes['/api/books'].GET?.response).toBe(ResponseSchema);
		});
	});
});
