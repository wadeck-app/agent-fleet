/**
 * ===========================================================================================
 * PAGINATION CONTRACT
 * ===========================================================================================
 *
 * Type-safe contract for pagination feature hooks.
 * Defines the shape of state, actions, and backend query parameters.
 *
 * Example usage:
 * ```typescript
 * function usePagination2(options: UsePagination2Options): PaginationContract {
 *   // Implementation...
 *   return { state, fstate, actions, toQuery };
 * }
 *
 * // In page component:
 * const pagination = usePagination2({ pageSize: 10, storageId: 'items' });
 * console.log(pagination.state.currentPage); // 1
 * pagination.actions.setPage(2);
 * const query = pagination.toQuery(); // { page: 2, pageSize: 10 }
 * ```
 *
 * ===========================================================================================
 */
import type { FeatureContract } from '../FeatureContract';

/**
 * Pagination UI state (what usePagination2 manages)
 */
export interface PaginationState {
	/** Current page number (1-indexed) */
	currentPage: number;

	/** Number of items per page */
	pageSize: number;

	/** Whether can navigate to previous page */
	canGoPrevious: boolean;

	/** Function to check if can navigate to next page (requires totalPages) */
	canGoNext: (totalPages?: number) => boolean;
}

/**
 * Pagination actions (all ways to modify pagination state)
 */
export interface PaginationActions {
	/** Set current page (1-indexed) */
	setPage: (page: number) => void;

	/** Set page size (automatically resets to page 1) */
	setPageSize: (size: number) => void;

	/** Navigate to next page */
	nextPage: () => void;

	/** Navigate to previous page */
	previousPage: () => void;

	/** Reset to initial page */
	resetPage: () => void;
}

/**
 * Pagination backend query parameters
 */
export interface PaginationQuery {
	/** Current page number (1-indexed) */
	page: number;

	/** Number of items per page */
	pageSize: number;
}

/**
 * Complete pagination contract (combines state, actions, query)
 */
export type PaginationContract = FeatureContract<PaginationState> & {
	actions: PaginationActions;
};
