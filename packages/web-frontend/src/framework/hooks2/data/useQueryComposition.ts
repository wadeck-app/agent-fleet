import { useMemo } from 'react';

import type { FeatureContract } from '@framework/types/FeatureContract';
import { type ComposedQuery, buildQuery } from '@framework/utils2/buildQuery';

/**
 * ===========================================================================================
 * USE QUERY COMPOSITION - Query Orchestration Hook
 * ===========================================================================================
 *
 * Composes queries from multiple feature contracts into a single query object.
 * Returns both the composed query and a stable URL representation for change detection.
 *
 * Key responsibilities:
 * - Extract fillQuery functions from feature contracts
 * - Compose them using buildQuery()
 * - Generate stable queryUrl for cache busting (source of truth for refetch detection)
 *
 * Example usage:
 * ```typescript
 * const { query, queryUrl } = useQueryComposition({
 *   pagination,
 *   sorting,
 *   search,
 *   filter,
 *   cache,
 * });
 *
 * // query: { page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', search: 'foo' }
 * // queryUrl: '{"page":1,"pageSize":10,"search":"foo","sortBy":"name","sortOrder":"asc"}'
 * ```
 *
 * ===========================================================================================
 */

export interface UseQueryCompositionResult {
	/** Composed query object from all features */
	query: ComposedQuery;
	/** Stable JSON string representation for change detection */
	queryUrl: string;
}

/**
 * Parameters for useQueryComposition hook.
 * Each feature is optional and can be null/undefined.
 */
export interface UseQueryCompositionParams {
	pagination?: FeatureContract<unknown> | null;
	sorting?: FeatureContract<unknown> | null;
	search?: FeatureContract<unknown> | null;
	filter?: FeatureContract<unknown> | null;
	cache?: FeatureContract<unknown> | null;
}

/**
 * Compose queries from multiple features into a single query object.
 * Features are passed individually (not as an array) to ensure stable dependencies.
 *
 * CRITICAL: This hook depends on fillQuery functions directly, not on feature objects.
 * This prevents unnecessary re-renders when feature objects change but their fillQuery doesn't.
 *
 * @param params - Individual feature contracts (nulls are filtered)
 * @returns Composed query and stable queryUrl for change detection
 */
export function useQueryComposition({
	pagination,
	sorting,
	search,
	filter,
	cache,
}: UseQueryCompositionParams): UseQueryCompositionResult {
	// Compose query from all features via buildQuery()
	// CRITICAL: Depend on fillQuery functions directly, not feature objects
	const query: ComposedQuery = useMemo(() => {
		return buildQuery(
			pagination?.fillQuery,
			sorting?.fillQuery,
			search?.fillQuery,
			filter?.fillQuery,
			cache?.fillQuery
		);
	}, [pagination?.fillQuery, sorting?.fillQuery, search?.fillQuery, filter?.fillQuery, cache?.fillQuery]);

	// Convert query to stable URL string for change detection
	// Sort keys for consistent ordering: { a: 1, b: 2 } === { b: 2, a: 1 }
	const queryUrl = useMemo(() => {
		const sortedQuery = Object.keys(query as Record<string, unknown>)
			.sort()
			.reduce(
				(acc: Record<string, unknown>, key) => {
					acc[key] = (query as Record<string, unknown>)[key];
					return acc;
				},
				{} as Record<string, unknown>
			);
		return JSON.stringify(sortedQuery);
	}, [query]);

	return { query, queryUrl };
}
