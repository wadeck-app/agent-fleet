import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SearchContract } from '@framework/types/contracts';

/**
 * ===========================================================================================
 * USE SIMPLE SEARCH - Simple Search Hook with 'q' URL Parameter
 * ===========================================================================================
 *
 * Lightweight search hook following the headless composable pattern.
 * Maps URL parameter 'q' to backend 'search' parameter.
 *
 * Key features:
 * - Uses URL parameters for persistence (shareable search URLs)
 * - Single input field, simple interface
 * - Returns standardized FeatureContract: { state, fstate, actions, fillQuery }
 * - Includes isEmpty derived state
 * - fillQuery() only sets 'search' param when non-empty
 *
 * UI vs URL Separation:
 * - state.query: What user typed (with spaces preserved)
 * - URL param: Trimmed version (for clean URLs)
 * - Backend: Trimmed version (security)
 *
 * Example usage:
 * ```typescript
 * const search = useSimpleSearch({
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
 * // Use in UI
 * <input
 *   value={search.state.query}
 *   onChange={e => search.actions.setQuery(e.target.value)}
 *   placeholder="Search..."
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

export interface UseSimpleSearchOptions {
	/**
	 * Callback invoked when search query changes.
	 * Useful for resetting pagination when user performs a new search.
	 */
	onSearchChange?: () => void;
}

/**
 * Headless search hook following the FeatureContract pattern.
 * Uses URL parameter 'q' for persistence and maps to backend 'search' parameter.
 *
 * Persistence Strategy:
 * - query: Persisted to URL params 'q' (shareable, browser back/forward support)
 * - URL stores trimmed version (keeps URLs clean)
 * - UI state preserves spaces
 *
 * @param options - Configuration options
 * @returns SearchContract with state, fstate, actions, fillQuery
 */
export function useSimpleSearch(options?: UseSimpleSearchOptions): SearchContract {
	const [searchParams, setSearchParams] = useSearchParams();
	const paramName = 'q'; // Always use 'q' for simple search

	// Get current search query from URL parameter (this is the trimmed version)
	const urlQuery = searchParams.get(paramName) || '';

	// Local state for UI (what user actually typed, without trimming)
	// Initialize from URL, but stays independent after that
	const [localQuery, setLocalQuery] = useState(urlQuery);

	// Sync local state with URL when URL changes externally (e.g., browser back/forward)
	useMemo(() => {
		setLocalQuery(urlQuery);
	}, [urlQuery]);

	// State object (current UI state)
	const state = useMemo(
		() => ({
			query: localQuery,
			trimmedQuery: localQuery.trim(),
			isEmpty: !localQuery.trim(),
		}),
		[localQuery]
	);

	// Frozen state (already stable via useMemo)
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
		[setSearchParams, onSearchChange]
	);

	// Fill backend query parameters
	// Maps 'q' URL param to 'search' backend param (only if non-empty)
	const fillQuery = useCallback(
		(queryObj: Record<string, unknown>) => {
			if (!fstate.trimmedQuery) {
				return;
			}

			queryObj.search = fstate.trimmedQuery;
		},
		[fstate.trimmedQuery]
	);

	return {
		state,
		fstate,
		actions,
		fillQuery,
	} satisfies SearchContract;
}
