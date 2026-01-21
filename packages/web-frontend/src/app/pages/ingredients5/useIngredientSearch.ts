import { useSearch } from '@framework/hooks/useSearch';

/**
 * Hook for managing ingredient search state in URL parameters
 * Wrapper around the generic useSearch hook with default parameter name 'search'
 */
export interface UseIngredientSearchOptions {
	/**
	 * Callback invoked when search query changes.
	 * Useful for resetting pagination when user performs a new search.
	 */
	onSearchChange?: () => void;
}

export interface UseIngredientSearchResult {
	/** Current search query from URL parameter */
	searchQuery: string;

	/** Update search query and URL parameter */
	setSearchQuery: (query: string) => void;

	/** Clear search query and remove URL parameter */
	clearSearch: () => void;
}

export function useIngredientSearch(options?: UseIngredientSearchOptions): UseIngredientSearchResult {
	return useSearch(options);
}
