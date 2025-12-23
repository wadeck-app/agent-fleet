/**
 * ===========================================================================================
 * SORTING CONTRACT
 * ===========================================================================================
 *
 * Type-safe contract for sorting feature hooks.
 * Supports multi-column sorting (shift+click to add secondary sort).
 *
 * Example usage:
 * ```typescript
 * function useSorting2(options: UseSorting2Options): SortingContract {
 *   // Implementation...
 *   return { state, fstate, actions, toQuery };
 * }
 *
 * // In page component:
 * const sorting = useSorting2({
 *   storageId: 'items-table',
 *   defaultSort: [{ key: 'name', direction: 'asc' }]
 * });
 *
 * // Single sort (click column header)
 * sorting.actions.handleSort('name', false);
 *
 * // Multi sort (shift+click column header)
 * sorting.actions.handleSort('createdAt', true);
 *
 * // Backend query
 * const query = sorting.toQuery();
 * // { sortBy: 'name,createdAt', sortOrder: 'asc,desc' }
 * ```
 *
 * ===========================================================================================
 */
import type { FeatureContract } from '../FeatureContract';

/**
 * Single sort configuration
 */
export interface SortConfig {
	/** Field key to sort by */
	key: string;
	/** Sort direction */
	direction: 'asc' | 'desc';
}

/**
 * Sort direction type
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sorting UI state (what useSorting2 manages)
 */
export interface SortingState {
	/** Current sort configurations (primary sort first) */
	sortConfigs: SortConfig[];

	/**
	 * Get sort info for a specific column
	 * Returns direction and priority (for multi-sort display)
	 */
	getSortInfo: (key: string) => {
		direction: SortDirection | null;
		priority: number | null;
	};
}

/**
 * Sorting actions (all ways to modify sorting state)
 */
export interface SortingActions {
	/**
	 * Handle sort change (click on column header)
	 * @param key - Column key to sort by
	 * @param shiftKey - If true, add to multi-sort; if false, replace sort
	 */
	handleSort: (key: string, shiftKey: boolean) => void;

	/** Clear all sorting */
	clearSort: () => void;

	/** Set sort configurations directly (useful for programmatic updates) */
	setSortConfigs: (configs: SortConfig[]) => void;
}

/**
 * Sorting backend query parameters
 */
export interface SortingQuery {
	/** Comma-separated field keys (e.g., 'name,createdAt') */
	sortBy?: string;

	/** Comma-separated sort directions (e.g., 'asc,desc') */
	sortOrder?: string;
}

/**
 * Complete sorting contract (combines state, actions, query)
 */
export type SortingContract = FeatureContract<SortingState> & {
	actions: SortingActions;
};
