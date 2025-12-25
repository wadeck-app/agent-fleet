import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SearchContract } from '@framework/types/contracts/SearchContract';

/**
 * ===========================================================================================
 * USE SEARCH2 - Headless Composable Search Hook
 * ===========================================================================================
 *
 * Next-generation search hook following the headless composable pattern.
 * Uses URL parameters for persistence (shareable search URLs).
 *
 * Key improvements over useSearch:
 * - Returns standardized FeatureContract: { state, fstate, actions, toQuery }
 * - Includes isEmpty derived state
 * - toQuery() only returns search param when non-empty
 * - Consistent with all other feature hooks
 *
 * UI vs URL Separation:
 * - state.query: What user typed (with spaces preserved)
 * - URL param: Trimmed version (for clean URLs)
 * - Backend: Trimmed version (security)
 *
 * Example usage:
 * ```typescript
 * const pagination = usePagination2({ pageSize: 10 });
 * const search = useSearch2({
 *   paramName: 'q',
 *   onSearchChange: () => pagination.actions.resetPage()
 * });
 *
 * // Access state
 * console.log(search.state.query); // 'chicken' (exact what user typed)
 * console.log(search.state.isEmpty); // false
 *
 * // Call actions
 * search.actions.setQuery('beef');
 * search.actions.clearQuery();
 *
 * // Get backend query (only if non-empty)
 * const query = search.toQuery();
 * // { search: 'chicken' } or {} if empty
 *
 * // Use in UI
 * <SearchInput
 *   value={search.state.query}
 *   onChange={search.actions.setQuery}
 *   onClear={search.actions.clearQuery}
 * />
 *
 * // Use in Data2 shell
 * <Data2 search={search} ...>
 *   <Table2 />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

export interface UseSearch2Options {
	/**
	 * Name of the URL parameter to use for search query
	 * @default 'search'
	 */
	paramName?: string;

	/**
	 * Callback invoked when search query changes.
	 * Useful for resetting pagination when user performs a new search.
	 */
	onSearchChange?: () => void;
}

/**
 * State shape for search feature.
 * Exported for type-safe consumption in Data2 and other components.
 */
export interface SearchState {
	/** Current search query */
	query: string;
	/** Whether search is empty (trimmed) */
	isEmpty: boolean;
}

/**
 * Headless search hook following the FeatureContract pattern.
 * Uses URL parameters for persistence (NOT localStorage).
 *
 * Persistence Strategy:
 * - query: Persisted to URL params (shareable, browser back/forward support)
 * - URL stores trimmed version (keeps URLs clean)
 * - UI state preserves spaces
 *
 * @param options - Configuration options
 * @returns SearchContract with fstate, actions, fillQuery
 */
export function useSearch2(options?: UseSearch2Options): SearchContract {
	const [searchParams, setSearchParams] = useSearchParams();
	const paramName = options?.paramName || 'search';

	// Get current search query from URL parameter (this is the trimmed version)
	const urlQuery = searchParams.get(paramName) || '';

	// Local state for UI (what user actually typed, without trimming)
	// Initialize from URL, but stays independent after that
	const [localQuery, setLocalQuery] = useState(urlQuery);

	// Sync local state with URL when URL changes externally (e.g., browser back/forward)
	useMemo(() => {
		setLocalQuery(urlQuery);
	}, [urlQuery]);

	// State object (current UI state) - uses local query (untrimmed)
	const state = useMemo(
		() => ({
			query: localQuery,
			trimmedQuery: localQuery.trim(),
			isEmpty: !localQuery.trim(),
		}),
		[localQuery]
	);

	// Frozen state (memoized, stable reference for useEffect deps)
	const fstate = state;

	// Actions (all state-modifying functions)
	const onSearchChange = options?.onSearchChange;
	const actions = useMemo(
		() => ({
			/**
			 * Set search query and update URL parameter.
			 * UI shows exactly what user typed (local state, no trim).
			 * URL stores trimmed version (keeps URLs clean).
			 */
			setQuery: (newQuery: string) => {
				// Update local UI state immediately (no trim)
				setLocalQuery(newQuery);

				// Update URL with trimmed version
				setSearchParams(
					prev => {
						const newParams = new URLSearchParams(prev);
						const trimmedQuery = newQuery.trim();

						if (trimmedQuery) {
							newParams.set(paramName, trimmedQuery);
						} else {
							newParams.delete(paramName);
						}

						return newParams;
					},
					{ replace: true } // Use replace to avoid cluttering browser history
				);

				// Trigger callback for pagination reset, etc.
				if (onSearchChange) {
					onSearchChange();
				}
			},

			/** Clear search query and remove URL parameter */
			clearQuery: () => {
				setLocalQuery('');
				setSearchParams(
					prev => {
						const newParams = new URLSearchParams(prev);
						newParams.delete(paramName);
						return newParams;
					},
					{ replace: true }
				);

				// Trigger callback for pagination reset, etc.
				if (onSearchChange) {
					onSearchChange();
				}
			},
		}),
		[setSearchParams, onSearchChange, paramName]
	);

	// Fill backend query parameters
	// Uses trimmed version for backend (security + prevents refetch on space-only changes)
	// ANTIFRAGILE PATTERN: Only depends on trimmedQuery, not raw query
	const fillQuery = useCallback(
		(queryObj: Record<string, unknown>) => {
			if (!state.trimmedQuery) {
				return; // Empty query - don't fill query
			}

			queryObj.search = state.trimmedQuery;
		},
		[state.trimmedQuery]
	);

	return {
		state,
		fstate,
		actions,
		fillQuery,
	} satisfies SearchContract;
}
