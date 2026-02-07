import { useCallback, useMemo, useState } from 'react';

import type { CacheControlContract } from '@framework/types/contracts';

/**
 * ===========================================================================================
 * USE CACHE CONTROL2 - Headless Composable Cache Control Feature
 * ===========================================================================================
 *
 * Feature hook for managing cache busting and explicit refresh control.
 * Follows the same pattern as usePagination2, useSearch2, useSorting2, etc.
 *
 * This is a composable feature that can be combined with other features in Data2.
 * It provides explicit control over cache invalidation and refresh behavior.
 *
 * Key improvements:
 * - Follows standardized FeatureContract pattern
 * - fstate (frozen state) for stable useEffect dependencies
 * - All actions grouped in actions object
 * - fillQuery() method for explicit query composition
 * - Optional (can be disabled)
 *
 * Example usage:
 * ```typescript
 * const cache = useCacheControl2({ enabled: true });
 *
 * // Access state
 * console.log(cache.state.cacheId); // 0
 * console.log(cache.state.isRefreshing); // false
 *
 * // Call actions
 * cache.actions.refresh(); // Increment cacheId to force refetch
 * cache.actions.setIsRefreshing(true);
 *
 * // Get backend query
 * const query = {};
 * cache.fillQuery(query);
 * // { cacheId: 1 }
 *
 * // Use in Data2 shell
 * <Data2 cache={cache} pagination={pagination} search={search}>
 *   <Table2 onRefresh={cache.actions.refresh} />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

export interface UseCacheControl2Options {
	/** Whether to include cacheId in query (default: true) */
	enabled?: boolean;

	/** Initial cache ID (default: 0) */
	initialCacheId?: number;
}

/**
 * Headless cache control hook following the FeatureContract pattern.
 *
 * Provides explicit control over cache busting:
 * - Manual refresh via refresh() action
 * - Auto-refresh after mutations (create, update, delete)
 * - Polling / periodic refresh
 * - Disable HTTP cache with cacheId parameter
 *
 * @param options - Configuration options
 * @returns CacheControlContract with state, fstate, actions, fillQuery
 */
export function useCacheControl2(options?: UseCacheControl2Options): CacheControlContract {
	const { enabled = true, initialCacheId = 0 } = options ?? {};

	// State
	const [cacheId, setCacheId] = useState(initialCacheId);
	const [isRefreshing, setIsRefreshingState] = useState(false);

	// Frozen state (memoized, stable reference for useEffect deps)
	// effectiveCacheId: only includes cacheId if enabled, otherwise undefined
	// This ensures fillQuery() has stable reference when disabled (antifragile pattern)
	const fstate = useMemo(
		() => ({
			cacheId,
			isRefreshing,
			effectiveCacheId: enabled ? cacheId : undefined,
		}),
		[cacheId, isRefreshing, enabled]
	);

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			/**
			 * Increment cacheId to force a refresh/refetch.
			 * Changes the query, which triggers Data2's useEffect.
			 */
			refresh: () => {
				console.log('[useCacheControl2] refresh() called, incrementing cacheId');
				setCacheId(prev => {
					const newId = prev + 1;
					console.log('[useCacheControl2] cacheId changed:', prev, '->', newId);
					return newId;
				});
			},

			/**
			 * Reset cacheId to initial value (usually 0).
			 * Useful to reset cache state.
			 */
			reset: () => {
				console.log('[useCacheControl2] reset() called');
				setCacheId(initialCacheId);
			},

			/**
			 * Set cacheId to a specific value.
			 * Useful for advanced scenarios like syncing cache across tabs.
			 */
			setCacheId: (id: number) => {
				if (id < 0) {
					console.warn(`Invalid cacheId: ${id}. Must be >= 0.`);
					return;
				}
				console.log('[useCacheControl2] setCacheId() called:', id);
				setCacheId(id);
			},

			/**
			 * Mark whether a refresh is in-progress.
			 * Useful for UI feedback (loading spinner, disabled buttons, etc).
			 */
			setIsRefreshing: (refreshing: boolean) => {
				console.log('[useCacheControl2] setIsRefreshing():', refreshing);
				setIsRefreshingState(refreshing);
			},
		}),
		[initialCacheId]
	);

	/**
	 * Fill backend query parameters with cache control info.
	 * Only includes cacheId if enabled (via effectiveCacheId in fstate).
	 *
	 * ANTIFRAGILE PATTERN:
	 * - If enabled=false: effectiveCacheId=undefined → fillQuery doesn't change when cacheId changes
	 * - If enabled=true: effectiveCacheId=cacheId → fillQuery changes when cacheId changes
	 * - If enabled changes: effectiveCacheId changes → fillQuery changes (correctly triggers refetch)
	 *
	 * This prevents unnecessary refetches when feature is disabled but cacheId increments.
	 *
	 * Example:
	 * ```typescript
	 * const query = {};
	 * cache.fillQuery(query);
	 * // If enabled and cacheId = 1:
	 * // query = { cacheId: 1 }
	 * // If disabled:
	 * // query = {} (unchanged)
	 * ```
	 */
	const fillQuery = useCallback(
		(query: Record<string, unknown>) => {
			if (fstate.effectiveCacheId !== undefined) {
				console.log('[useCacheControl2] fillQuery() called, adding cacheId:', fstate.effectiveCacheId);
				query.cacheId = fstate.effectiveCacheId;
			} else {
				console.log('[useCacheControl2] fillQuery() called but disabled, skipping cacheId');
			}
		},
		[fstate.effectiveCacheId]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
