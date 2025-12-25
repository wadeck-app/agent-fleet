import type { FeatureContract, QueryFiller } from '@framework/types/FeatureContract';
import { BaseListQuerySchema } from '@shared/common/api-helpers';

/**
 * ===========================================================================================
 * BUILD QUERY - Feature Query Composition Utility (Type-Safe Mutation Pattern)
 * ===========================================================================================
 *
 * Composes multiple feature queries into a single backend query object.
 * This is the glue that makes features truly composable and independent.
 *
 * Key Principles:
 * - Features fill the query via fillQuery(query) => void (mutation)
 * - Features are processed in order (later overrides earlier for same property)
 * - Empty/undefined/null values are filtered out after composition
 * - Type-safe with proper TypeScript inference via BaseListQuerySchema
 * - Validated against BaseListQuerySchema (errors if data doesn't match)
 *
 * Example usage:
 * ```typescript
 * const pagination = usePagination2({ pageSize: 10 });
 * const sorting = useSorting2({ defaultSort: [{ key: 'name', direction: 'asc' }] });
 * const search = useSearch2({ paramName: 'q' });
 *
 * const query = buildQuery(
 *   pagination,
 *   sorting,
 *   search
 * );
 * // Result: { page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', search: 'chicken' }
 *
 * const result = await fetchIngredients(query);
 * ```
 *
 * Why fillQuery instead of toQuery?
 * ```typescript
 * // ❌ Old pattern (loses type safety on keys):
 * const query = buildQuery<IngredientsListQuery>(pagination, sorting, search);
 * // IngredientsListQuery could have any shape
 *
 * // ✅ New pattern (enforces BaseListQuerySchema):
 * const query = buildQuery(pagination, sorting, search);
 * // Each feature fills query.page, query.search, etc. with type safety
 * // TypeScript knows exactly which properties exist
 * ```
 *
 * ===========================================================================================
 */

/**
 * Type for the composed backend query (validated against BaseListQuerySchema)
 */
export type ComposedQuery = {
	search?: string;
	category?: string;
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: string;
	[key: string]: unknown;
};

/**
 * Compose multiple feature queries into a single backend query object.
 *
 * Strategy:
 * - Each feature calls fillQuery(query) to fill properties
 * - Features are processed in order (FIFO override: last write wins)
 * - Filters out undefined, null, and empty string values
 * - Validates result against BaseListQuerySchema
 *
 * @param queryFillers - Variable number of feature contracts (undefined/null are skipped)
 * @returns Validated query object typed as ComposedQuery
 * @throws ZodError if validation fails (developer error, not recoverable)
 *
 * @example
 * ```typescript
 * const query = buildQuery(
 *   pagination,
 *   sorting,
 *   search,
 *   categoryFilter
 * );
 * ```
 */
export function buildQuery(...queryFillers: Array<QueryFiller | undefined | null>): ComposedQuery {
	const query: Record<string, unknown> = {};

	// 1. Each feature fills the query (order = priority)
	for (const queryFiller of queryFillers) {
		// Skip undefined/null features gracefully
		if (!queryFiller) continue;

		queryFiller(query);
	}

	// 2. Filter out empty values (undefined, null, empty strings)
	const cleaned = Object.fromEntries(
		Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
	);

	console.log('[buildQuery] Final query:', cleaned);
	// 3. Validate base fields against BaseListQuerySchema (keeps extra properties)
	// Extract only the base query fields for validation
	const baseQueryFields = {
		search: cleaned.search,
		page: cleaned.page,
		pageSize: cleaned.pageSize,
		sortBy: cleaned.sortBy,
		sortOrder: cleaned.sortOrder,
	};

	// Validate the base fields
	const validatedBase = BaseListQuerySchema.parse(baseQueryFields);

	// Remove undefined properties from validated base
	const filteredBase = Object.fromEntries(Object.entries(validatedBase).filter(([, value]) => value !== undefined));

	// Merge back extra properties (like category from filters)
	const result = {
		...filteredBase,
		...Object.fromEntries(
			Object.entries(cleaned).filter(
				([key]) => !['search', 'page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)
			)
		),
	};

	return result as ComposedQuery;
}

/**
 * Query builder class for fluent API (alternative to functional buildQuery).
 * Useful when you want more explicit composition or conditional adds.
 *
 * Example usage:
 * ```typescript
 * const query = new QueryBuilder()
 *   .add(pagination)
 *   .add(sorting)
 *   .addIf(searchEnabled, search)
 *   .build();
 * ```
 */
export class QueryBuilder {
	private query: Record<string, unknown> = {};

	/**
	 * Add a feature's query to the composition.
	 * Undefined/null features are skipped gracefully.
	 *
	 * @param feature - Feature contract to add
	 * @returns this (for method chaining)
	 */
	add(feature: FeatureContract<any> | undefined | null): this {
		if (!feature) return this;

		feature.fillQuery(this.query);
		return this;
	}

	/**
	 * Conditionally add a feature (useful for optional filters)
	 *
	 * @param condition - Whether to add the feature
	 * @param feature - Feature contract to add if condition is true
	 * @returns this (for method chaining)
	 */
	addIf(condition: boolean, feature: FeatureContract<any> | undefined | null): this {
		if (!condition) return this;
		return this.add(feature);
	}

	/**
	 * Build the final composed query.
	 * Filters empty values and validates against BaseListQuerySchema.
	 *
	 * @returns Validated query object
	 * @throws ZodError if validation fails
	 */
	build(): ComposedQuery {
		// Filter out empty values
		const cleaned = Object.fromEntries(
			Object.entries(this.query).filter(([, value]) => value !== undefined && value !== null && value !== '')
		);

		// Validate base fields against BaseListQuerySchema (keeps extra properties)
		// Extract only the base query fields for validation
		const baseQueryFields = {
			search: cleaned.search,
			page: cleaned.page,
			pageSize: cleaned.pageSize,
			sortBy: cleaned.sortBy,
			sortOrder: cleaned.sortOrder,
		};

		// Validate the base fields
		const validatedBase = BaseListQuerySchema.parse(baseQueryFields);

		// Remove undefined properties from validated base
		const filteredBase = Object.fromEntries(
			Object.entries(validatedBase).filter(([, value]) => value !== undefined)
		);

		// Merge back extra properties (like category from filters)
		const result = {
			...filteredBase,
			...Object.fromEntries(
				Object.entries(cleaned).filter(
					([key]) => !['search', 'page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)
				)
			),
		};

		return result as ComposedQuery;
	}
}
