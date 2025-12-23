import type { FeatureContract } from '@framework/types/FeatureContract';
import type { BaseListQueryMutable } from '@shared';
import { describe, expect, it } from 'vitest';

import { QueryBuilder, buildQuery } from './buildQuery';

describe('buildQuery', () => {
	// Mock feature contracts for testing with fillQuery pattern
	const createMockFeature = (fillFn: (query: BaseListQueryMutable) => void): FeatureContract<any> => ({
		fstate: {},
		actions: {},
		fillQuery: fillFn,
	});

	describe('basic composition', () => {
		it('should return empty object when no features provided', () => {
			const query = buildQuery();

			expect(query).toEqual({});
		});

		it('should return single feature query', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});

			const result = buildQuery(pagination);

			expect(result).toEqual({ page: 1, pageSize: 10 });
		});

		it('should merge multiple features correctly', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const sorting = createMockFeature(query => {
				query.sortBy = 'name';
				query.sortOrder = 'asc';
			});
			const search = createMockFeature(query => {
				query.search = 'chicken';
			});

			const result = buildQuery(pagination, sorting, search);

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
				sortBy: 'name',
				sortOrder: 'asc',
				search: 'chicken',
			});
		});
	});

	describe('empty value filtering', () => {
		it('should filter out undefined values', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
				query.pageSize = undefined;
			});
			const feature2 = createMockFeature(query => {
				query.search = 'test';
			});

			const result = buildQuery(feature1, feature2);

			expect(result).toEqual({ page: 1, search: 'test' });
			expect(result).not.toHaveProperty('pageSize');
		});

		it('should filter out null values', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
				query.pageSize = null;
			});
			const feature2 = createMockFeature(query => {
				query.search = 'test';
			});

			const result = buildQuery(feature1, feature2);

			expect(result).toEqual({ page: 1, search: 'test' });
			expect(result).not.toHaveProperty('pageSize');
		});

		it('should filter out empty strings', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
			});
			const feature2 = createMockFeature(query => {
				query.search = '';
			});

			const result = buildQuery(feature1, feature2);

			expect(result).toEqual({ page: 1 });
			expect(result).not.toHaveProperty('search');
		});

		it('should keep zero values', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				query.offset = 0;
			});

			const result = buildQuery(feature);

			expect(result).toEqual({ page: 1, offset: 0 });
		});

		it('should keep false values', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				query.includeDeleted = false;
			});

			const result = buildQuery(feature);

			expect(result).toEqual({ page: 1, includeDeleted: false });
		});
	});

	describe('feature precedence', () => {
		it('should let later features override earlier ones', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const feature2 = createMockFeature(query => {
				query.page = 5;
			});

			const result = buildQuery(feature1, feature2);

			expect(result).toEqual({ page: 5, pageSize: 10 });
		});

		it('should handle complete override', () => {
			const feature1 = createMockFeature(query => {
				query.sortBy = 'name';
				query.sortOrder = 'asc';
			});
			const feature2 = createMockFeature(query => {
				query.sortBy = 'createdAt';
				query.sortOrder = 'desc';
			});

			const result = buildQuery(feature1, feature2);

			expect(result).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
		});
	});

	describe('undefined/null features', () => {
		it('should skip undefined features gracefully', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
			});
			const feature2 = undefined;
			const feature3 = createMockFeature(query => {
				query.search = 'test';
			});

			const result = buildQuery(feature1, feature2, feature3);

			expect(result).toEqual({ page: 1, search: 'test' });
		});

		it('should skip null features gracefully', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
			});
			const feature2 = null;
			const feature3 = createMockFeature(query => {
				query.search = 'test';
			});

			const result = buildQuery(feature1, feature2, feature3);

			expect(result).toEqual({ page: 1, search: 'test' });
		});

		it('should handle all undefined/null features', () => {
			const result = buildQuery(undefined, null, undefined);

			expect(result).toEqual({});
		});
	});

	describe('real-world scenarios', () => {
		it('should handle pagination + sorting + search', () => {
			const pagination = createMockFeature(query => {
				query.page = 2;
				query.pageSize = 20;
			});
			const sorting = createMockFeature(query => {
				query.sortBy = 'name,createdAt';
				query.sortOrder = 'asc,desc';
			});
			const search = createMockFeature(query => {
				query.search = 'chicken';
			});

			const result = buildQuery(pagination, sorting, search);

			expect(result).toEqual({
				page: 2,
				pageSize: 20,
				sortBy: 'name,createdAt',
				sortOrder: 'asc,desc',
				search: 'chicken',
			});
		});

		it('should handle pagination + sorting + empty search', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const sorting = createMockFeature(query => {
				query.sortBy = 'name';
				query.sortOrder = 'asc';
			});
			const search = createMockFeature(query => {
				query.search = ''; // Empty search
			});

			const result = buildQuery(pagination, sorting, search);

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
				sortBy: 'name',
				sortOrder: 'asc',
			});
			expect(result).not.toHaveProperty('search');
		});

		it('should handle pagination + sorting + no search', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const sorting = createMockFeature(query => {
				query.sortBy = 'name';
				query.sortOrder = 'asc';
			});
			const search = createMockFeature(query => {
				// No search filled
			});

			const result = buildQuery(pagination, sorting, search);

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
				sortBy: 'name',
				sortOrder: 'asc',
			});
		});

		it('should handle filter with value', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const filter = createMockFeature(query => {
				query.category = 'Protein';
			});

			const result = buildQuery(pagination, filter);

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
				category: 'Protein',
			});
		});

		it('should handle filter without value', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const filter = createMockFeature(query => {
				// No filter value
			});

			const result = buildQuery(pagination, filter);

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
			});
		});
	});

	describe('validation', () => {
		it('should validate against BaseListQuerySchema', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});

			// Should not throw
			const result = buildQuery(feature);
			expect(result).toEqual({ page: 1, pageSize: 10 });
		});

		it('should validate page as positive integer', () => {
			const feature = createMockFeature(query => {
				query.page = -1; // Invalid
				query.pageSize = 10;
			});

			// Should throw ZodError
			expect(() => buildQuery(feature)).toThrow();
		});

		it('should validate pageSize max 100', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 200; // Exceeds max
			});

			// Should throw ZodError
			expect(() => buildQuery(feature)).toThrow();
		});

		it('should sanitize search input', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				// Search with special chars should be sanitized
				query.search = 'test; DROP TABLE';
			});

			const result = buildQuery(feature) as Record<string, unknown>;

			// SQL injection chars should be removed
			const searchValue = result.search as string;
			expect(searchValue).not.toContain(';');
			expect(searchValue).not.toContain("'");
		});
	});
});

describe('QueryBuilder', () => {
	const createMockFeature = (fillFn: (query: BaseListQueryMutable) => void): FeatureContract<any> => ({
		fstate: {},
		actions: {},
		fillQuery: fillFn,
	});

	describe('fluent API', () => {
		it('should build query using fluent API', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const sorting = createMockFeature(query => {
				query.sortBy = 'name';
				query.sortOrder = 'asc';
			});
			const search = createMockFeature(query => {
				query.search = 'chicken';
			});

			const result = new QueryBuilder().add(pagination).add(sorting).add(search).build();

			expect(result).toEqual({
				page: 1,
				pageSize: 10,
				sortBy: 'name',
				sortOrder: 'asc',
				search: 'chicken',
			});
		});

		it('should handle undefined features gracefully', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
			});

			const result = new QueryBuilder().add(pagination).add(undefined).add(null).build();

			expect(result).toEqual({ page: 1 });
		});

		it('should filter empty values', () => {
			const feature1 = createMockFeature(query => {
				query.page = 1;
			});
			const feature2 = createMockFeature(query => {
				query.search = '';
			});

			const result = new QueryBuilder().add(feature1).add(feature2).build();

			expect(result).toEqual({ page: 1 });
			expect(result).not.toHaveProperty('search');
		});

		it('should support addIf for conditional features', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const search = createMockFeature(query => {
				query.search = 'test';
			});

			// Add search only if condition is true
			const result = new QueryBuilder().add(pagination).addIf(true, search).build();

			expect(result).toEqual({ page: 1, pageSize: 10, search: 'test' });
		});

		it('should skip feature when addIf condition is false', () => {
			const pagination = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});
			const search = createMockFeature(query => {
				query.search = 'test';
			});

			// Don't add search if condition is false
			const result = new QueryBuilder().add(pagination).addIf(false, search).build();

			expect(result).toEqual({ page: 1, pageSize: 10 });
			expect(result).not.toHaveProperty('search');
		});
	});

	describe('validation with builder', () => {
		it('should validate final query', () => {
			const feature = createMockFeature(query => {
				query.page = 1;
				query.pageSize = 10;
			});

			// Should not throw
			const result = new QueryBuilder().add(feature).build();

			expect(result).toEqual({ page: 1, pageSize: 10 });
		});

		it('should throw validation error on invalid data', () => {
			const feature = createMockFeature(query => {
				query.page = -1; // Invalid
			});

			// Should throw ZodError
			expect(() => new QueryBuilder().add(feature).build()).toThrow();
		});
	});
});
