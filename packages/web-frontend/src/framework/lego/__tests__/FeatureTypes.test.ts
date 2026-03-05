import { describe, expect, it } from 'vitest';

import type { DataTableFeature, PaginationConfig, SearchConfig } from '../types/FeatureTypes';
import { resolveFeature } from '../types/FeatureTypes';

/**
 * ===========================================================================================
 * FEATURE TYPES TESTS
 * ===========================================================================================
 *
 * Validates the feature configuration resolution and type discrimination.
 *
 * ===========================================================================================
 */

describe('resolveFeature', () => {
	it('should resolve string shorthand to default config', () => {
		const result = resolveFeature<SearchConfig>('search', 'search');

		expect(result).toEqual({
			type: 'search',
		});
	});

	it('should pass through full config object', () => {
		const config: SearchConfig = {
			type: 'search',
			placeholder: 'Search products...',
			debounce: 300,
		};

		const result = resolveFeature<SearchConfig>(config, 'search');

		expect(result).toEqual(config);
	});

	it('should return null for mismatched type', () => {
		const result = resolveFeature<SearchConfig>('pagination', 'search');

		expect(result).toBeNull();
	});

	it('should work with pagination config', () => {
		const config: PaginationConfig = {
			type: 'pagination',
			pageSizes: [10, 20, 50],
			defaultPageSize: 20,
		};

		const result = resolveFeature<PaginationConfig>(config, 'pagination');

		expect(result).toEqual(config);
	});
});

describe('DataTableFeature type', () => {
	it('should accept string shortcuts', () => {
		const features: DataTableFeature[] = ['search', 'pagination', 'sorting'];

		expect(features).toHaveLength(3);
	});

	it('should accept config objects', () => {
		const features: DataTableFeature[] = [
			{ type: 'search', placeholder: 'Search...', debounce: 300 },
			{ type: 'pagination', pageSizes: [10, 20], defaultPageSize: 10 },
			{ type: 'sorting', multi: true },
		];

		expect(features).toHaveLength(3);
	});

	it('should accept mixed shortcuts and configs', () => {
		const features: DataTableFeature[] = [
			'search',
			{ type: 'pagination', defaultPageSize: 20 },
			'sorting',
			{ type: 'bulk-delete', confirmMessage: 'Are you sure?' },
		];

		expect(features).toHaveLength(4);
	});
});
