import { useSearch } from '@framework/hooks/useSearch';

/**
 * ===========================================================================================
 * USE BOOK SEARCH - URL-based Search State Management Hook
 * ===========================================================================================
 *
 * Manages search query state in URL parameters for the BooksPage.
 * This is a convenience wrapper around the generic useSearch hook.
 *
 * Provides a modular, composable interface for search functionality that integrates
 * with the existing hook ecosystem (usePagination, useSorting, etc.).
 *
 * Features:
 * - URL parameter-based state (not localStorage)
 * - Clean URLs (removes param when empty)
 * - Pagination reset callback integration
 * - No debouncing (handled by SearchInput component)
 * - Browser history support (back/forward buttons work)
 * - Shareable search URLs
 *
 * Example usage:
 * ```typescript
 * const pagination = usePagination({ pageSize: 10, storageId: 'books' });
 *
 * const search = useBookSearch({
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

export interface UseBookSearchOptions {
	/**
	 * Callback invoked when search query changes.
	 * Useful for resetting pagination when user performs a new search.
	 */
	onSearchChange?: () => void;
}

export interface UseBookSearchResult {
	/** Current search query from URL parameter */
	searchQuery: string;

	/** Update search query and URL parameter */
	setSearchQuery: (query: string) => void;

	/** Clear search query and remove URL parameter */
	clearSearch: () => void;
}

/**
 * Hook for managing book search state in URL parameters
 * Wrapper around the generic useSearch hook with default parameter name 'search'
 *
 * @param options - Configuration options including onSearchChange callback
 * @returns Search state and control functions
 */
export function useBookSearch(options?: UseBookSearchOptions): UseBookSearchResult {
	return useSearch(options);
}
