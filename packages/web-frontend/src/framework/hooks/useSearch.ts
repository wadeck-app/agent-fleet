import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * ===========================================================================================
 * USE SEARCH - URL-based Search State Management Hook
 * ===========================================================================================
 *
 * Generic hook for managing search query state in URL parameters.
 * Provides a modular, composable interface for search functionality that integrates
 * with the existing hook ecosystem (usePagination, useSorting, etc.).
 *
 * Features:
 * - URL parameter-based state (not localStorage)
 * - Configurable parameter name (default: 'search')
 * - Clean URLs (removes param when empty)
 * - Pagination reset callback integration
 * - No debouncing (handled by SearchInput component)
 * - Browser history support (back/forward buttons work)
 * - Shareable search URLs
 *
 * Example usage:
 * ```typescript
 * const pagination = usePagination({ pageSize: 10, storageId: 'items' });
 *
 * const search = useSearch({
 *   paramName: 'q', // Optional, defaults to 'search'
 *   onSearchChange: () => pagination.setPage(1) // Reset to page 1 on search
 * });
 *
 * <SearchInput
 *   value={search.searchQuery}
 *   onChange={search.setSearchQuery}
 *   onClear={search.clearSearch}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface UseSearchOptions {
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

export interface UseSearchResult {
	/** Current search query from URL parameter */
	searchQuery: string;

	/** Update search query and URL parameter */
	setSearchQuery: (query: string) => void;

	/** Clear search query and remove URL parameter */
	clearSearch: () => void;
}

/**
 * Hook for managing search state in URL parameters
 *
 * @param options - Configuration options including paramName and onSearchChange callback
 * @returns Search state and control functions
 *
 * @example
 * ```typescript
 * // Basic usage with default parameter name 'search'
 * const search = useSearch();
 *
 * // With custom parameter name
 * const search = useSearch({ paramName: 'q' });
 *
 * // With pagination reset
 * const pagination = usePagination({ pageSize: 10 });
 * const search = useSearch({
 *   onSearchChange: () => pagination.setPage(1)
 * });
 * ```
 */
export function useSearch(options?: UseSearchOptions): UseSearchResult {
	const [searchParams, setSearchParams] = useSearchParams();
	const paramName = options?.paramName || 'search';

	// Get current search query from URL parameter
	// Defensive: handle null/undefined searchParams (shouldn't happen in normal Router context)
	const searchQuery = searchParams?.get(paramName) || '';

	/**
	 * Update search query and URL parameter
	 * Removes the parameter if query is empty to keep URLs clean
	 * Triggers onSearchChange callback for pagination reset
	 */
	const onSearchChange = options?.onSearchChange;
	const setSearchQuery = useCallback(
		(query: string) => {
			setSearchParams(
				prev => {
					const newParams = new URLSearchParams(prev);
					const trimmedQuery = query.trim();

					if (trimmedQuery) {
						newParams.set(paramName, trimmedQuery);
					} else {
						newParams.delete(paramName);
					}

					return newParams;
				},
				{ replace: true } // Use replace to avoid cluttering browser history
			);

			// Trigger callback for pagination reset
			if (onSearchChange) {
				onSearchChange();
			}
		},
		[setSearchParams, onSearchChange, paramName]
	);

	/**
	 * Clear search query and remove URL parameter
	 */
	const clearSearch = useCallback(() => {
		setSearchQuery('');
	}, [setSearchQuery]);

	return {
		searchQuery,
		setSearchQuery,
		clearSearch,
	};
}
