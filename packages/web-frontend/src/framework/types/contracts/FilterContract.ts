/**
 * ===========================================================================================
 * FILTER CONTRACT
 * ===========================================================================================
 *
 * Type-safe contract for filter feature hooks.
 * Generic contract that works with any filter type (category, status, etc.).
 *
 * Example usage:
 * ```typescript
 * // Category filter
 * function useCategoryFilter2(options: UseCategoryFilter2Options): FilterContract<string> {
 *   // Implementation...
 *   return { state, fstate, actions, toQuery };
 * }
 *
 * // In page component:
 * const categoryFilter = useCategoryFilter2({
 *   categories: ['Protein', 'Vegetable', 'Fruit'],
 *   storageId: 'items'
 * });
 *
 * // In UI:
 * <Select
 *   value={categoryFilter.state.value || ''}
 *   onChange={(e) => categoryFilter.actions.setValue(e.target.value || null)}
 * >
 *   <option value="">All Categories</option>
 *   {categoryFilter.state.options.map(cat => (
 *     <option key={cat} value={cat}>{cat}</option>
 *   ))}
 * </Select>
 *
 * // Backend query (only includes filter if value set)
 * const query = categoryFilter.toQuery(); // { category: 'Protein' } or {}
 * ```
 *
 * ===========================================================================================
 */
import type { FeatureContract } from '../FeatureContract';

/**
 * Filter UI state (what useFilter2 hooks manage)
 *
 * @template T - Type of filter value (string, number, boolean, etc.)
 */
export interface FilterState<T = string> {
	/** Current filter value (null if no filter applied) */
	value: T | null;

	/** Available filter options */
	options: T[];
}

/**
 * Filter actions (all ways to modify filter state)
 *
 * @template T - Type of filter value
 */
export interface FilterActions<T = string> {
	/** Set filter value (null to clear filter) */
	setValue: (value: T | null) => void;

	/** Clear filter value */
	clearValue: () => void;
}

/**
 * Filter backend query parameters.
 * The key depends on the filter type (e.g., { category: 'Protein' } or { status: 'active' })
 */
export interface FilterQuery {
	[key: string]: string | undefined;
}

/**
 * Complete filter contract (combines state, actions, query)
 *
 * @template T - Type of filter value
 */
export type FilterContract<T = string> = FeatureContract<FilterState<T>> & {
	actions: FilterActions<T>;
};
