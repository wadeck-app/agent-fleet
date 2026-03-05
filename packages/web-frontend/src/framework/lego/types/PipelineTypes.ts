/**
 * ===========================================================================================
 * PIPELINE TYPES - Query-Modifier Pipeline Foundation
 * ===========================================================================================
 *
 * Core types for the query-modifier pipeline architecture (Approach A5).
 *
 * Pattern:
 * - BaseQuery: Standard query interface with common fields
 * - QueryModifier: Pure function that transforms a query
 * - Modifier factories: Composable functions that create modifiers
 *
 * Philosophy:
 * - Immutable transformations (no side effects)
 * - Composable modifiers (chain them sequentially)
 * - Type-safe query building
 * - Predictable data flow: modifiers → query → fetch
 *
 * ===========================================================================================
 */

/**
 * Base query type with common fields
 * All modifiers work with this shape
 */
export interface BaseQuery {
	search?: string;
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: string;
	[key: string]: unknown;
}

/**
 * Query modifier function
 * Takes a query, returns a new query (pure function)
 */
export type QueryModifier = (query: BaseQuery) => BaseQuery;

/**
 * Modifier factory: Search
 * Adds or updates search term in query
 */
export function withSearch(value: string): QueryModifier {
	return query => ({ ...query, search: value });
}

/**
 * Modifier factory: Pagination
 * Adds or updates page and pageSize in query
 */
export function withPagination(page: number, pageSize: number): QueryModifier {
	return query => ({ ...query, page, pageSize });
}

/**
 * Modifier factory: Sorting
 * Adds or updates sortBy and sortOrder in query
 */
export function withSort(key: string, order: 'asc' | 'desc'): QueryModifier {
	return query => ({ ...query, sortBy: key, sortOrder: order });
}

/**
 * Modifier factory: Feature
 * Adds custom feature config to query
 */
export function withFeature(name: string, config: unknown): QueryModifier {
	return query => ({ ...query, [name]: config });
}

/**
 * Modifier factory: Clear field
 * Removes a field from query
 */
export function withoutField(field: string): QueryModifier {
	return query => {
		const { [field]: _, ...rest } = query;
		return rest;
	};
}

/**
 * Compose multiple modifiers into one
 * Applies them sequentially from left to right
 */
export function composeModifiers(...modifiers: QueryModifier[]): QueryModifier {
	return query => modifiers.reduce((acc, modifier) => modifier(acc), query);
}
