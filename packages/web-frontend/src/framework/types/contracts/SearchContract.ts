/**
 * ===========================================================================================
 * SEARCH CONTRACT
 * ===========================================================================================
 *
 * Type-safe contract for search feature hooks.
 * Uses URL parameters for persistence (shareable search URLs).
 *
 * Example usage:
 * ```typescript
 * function useSearch2(options?: UseSearch2Options): SearchContract {
 *   // Implementation...
 *   return { state, fstate, actions, toQuery };
 * }
 *
 * // In page component:
 * const pagination = usePagination2({ pageSize: 10 });
 * const search = useSearch2({
 *   paramName: 'q',
 *   onSearchChange: () => pagination.actions.resetPage() // Reset to page 1 on search
 * });
 *
 * // In UI:
 * <SearchInput
 *   value={search.state.query}
 *   onChange={search.actions.setQuery}
 *   onClear={search.actions.clearQuery}
 * />
 *
 * // Backend query (only includes search if non-empty)
 * const query = search.toQuery(); // { search: 'chicken' } or {}
 * ```
 *
 * ===========================================================================================
 */
import type { BaseListQueryMutable } from '@shared/common/api-helpers';

/**
 * Search UI state (what useSearch2 manages)
 */
export interface SearchState {
	/** Current search query (from URL parameter) */
	query: string;

	/**
	 * Trimmed version of query (used for backend requests).
	 * ANTIFRAGILE PATTERN: Used as dependency for fillQuery() to avoid
	 * unnecessary refetches when user only types/removes spaces.
	 */
	trimmedQuery: string;

	/** Whether search is empty (derived state for convenience) */
	isEmpty: boolean;
}

/**
 * Search actions (all ways to modify search state)
 */
export interface SearchActions extends Record<string, (...args: any[]) => void> {
	/**
	 * Set search query and update URL parameter
	 * Removes parameter if query is empty (keeps URLs clean)
	 */
	setQuery: (query: string) => void;

	/** Clear search query and remove URL parameter */
	clearQuery: () => void;
}

/**
 * Search backend query parameters
 */
export interface SearchQuery {
	/**
	 * Search query string
	 * Only present if query is non-empty (toQuery returns {} when empty)
	 */
	search?: string;
}

/**
 * Complete search contract (combines state, actions, query)
 */
export type SearchContract = {
	state: SearchState;
	fstate: SearchState;
	actions: SearchActions;
	fillQuery: (query: BaseListQueryMutable) => void;
};
