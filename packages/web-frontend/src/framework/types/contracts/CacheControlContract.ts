/**
 * ===========================================================================================
 * CACHE CONTROL CONTRACT
 * ===========================================================================================
 *
 * Type-safe contract for cache control feature hook.
 * Provides explicit control over cache busting and refresh behavior.
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
 *
 * // Use in Data2 shell
 * <Data2 cache={cache} pagination={pagination} search={search}>
 *   <Table2 onRefresh={cache.actions.refresh} />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */
import type { FeatureContract } from '../FeatureContract';

/**
 * Cache control UI state
 */
export interface CacheControlState {
	/** Current cache ID (incremented on refresh) */
	cacheId: number;

	/** Whether a refresh is currently in progress */
	isRefreshing: boolean;
}

/**
 * Cache control actions
 */
export interface CacheControlActions {
	/** Increment cacheId to force refresh */
	refresh: () => void;

	/** Reset cacheId to 0 */
	reset: () => void;

	/** Set cacheId to specific value */
	setCacheId: (id: number) => void;

	/** Mark refresh as in-progress */
	setIsRefreshing: (refreshing: boolean) => void;
}

/**
 * Cache control backend query parameters
 */
export interface CacheControlQuery {
	cacheId?: number;
}

/**
 * Complete cache control contract
 */
export type CacheControlContract = FeatureContract<CacheControlState> & {
	actions: CacheControlActions;
};
