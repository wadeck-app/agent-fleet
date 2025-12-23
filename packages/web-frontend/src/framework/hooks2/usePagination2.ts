import { useCallback, useEffect, useMemo, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';
import type { FeatureContract } from '@framework/types/FeatureContract';

/**
 * ===========================================================================================
 * USE PAGINATION2 - Headless Composable Pagination Hook
 * ===========================================================================================
 *
 * Next-generation pagination hook following the headless composable pattern.
 * This is the REFERENCE IMPLEMENTATION - all other feature hooks follow this structure.
 *
 * Key improvements over usePagination:
 * - Returns standardized FeatureContract: { state, fstate, actions, toQuery }
 * - fstate (frozen state) for stable useEffect dependencies
 * - All actions grouped in actions object
 * - toQuery() method for explicit query composition
 * - Consistent with all other feature hooks
 *
 * Example usage:
 * ```typescript
 * const pagination = usePagination2({
 *   pageSize: 10,
 *   storageId: 'ingredients2',
 *   initialPage: 1
 * });
 *
 * // Access state
 * console.log(pagination.state.currentPage); // 1
 * console.log(pagination.state.pageSize); // 10
 *
 * // Call actions
 * pagination.actions.setPage(2);
 * pagination.actions.setPageSize(20);
 *
 * // Get backend query
 * const query = pagination.toQuery(); // { page: 2, pageSize: 20 }
 *
 * // Use in Data2 shell
 * <Data2 pagination={pagination} ...>
 *   <Table2 />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

export interface UsePagination2Options {
	/** Number of items per page (initial value) */
	pageSize: number;
	/** Initial page (default: 1) */
	initialPage?: number;
	/** Storage ID for persistence (e.g., 'items', 'products'). If provided, appends '-pagination' */
	storageId?: string;
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

/**
 * State shape for pagination feature.
 * Exported for type-safe consumption in Data2 and other components.
 */
export interface PaginationState {
	/** Current page number (1-indexed) */
	currentPage: number;
	/** Items per page */
	pageSize: number;
	/** Whether we can go to previous page */
	canGoPrevious: boolean;
	/** Whether we can go to next page (function because it needs totalPages context) */
	canGoNext: (totalPages?: number) => boolean;
}

/**
 * Type alias for pagination feature contract.
 * Ensures type safety when passing pagination feature to Data2.
 */
export type PaginationContract = FeatureContract<PaginationState>;

/**
 * Headless pagination hook following the FeatureContract pattern.
 * This is the reference implementation for all feature hooks.
 *
 * Persistence Strategy:
 * - pageSize: Persisted to localStorage (user preference)
 * - currentPage: Runtime only (resets on page reload)
 *
 * @param options - Configuration options
 * @returns PaginationContract with state, fstate, actions, fillQuery
 */
export function usePagination2(options: UsePagination2Options): PaginationContract {
	const { pageSize: initialPageSize, initialPage = 1, storageId, storage = defaultStorage } = options;

	// Storage key for pagination state
	const storageKey = storageId ? `${storageId}-pagination` : null;

	// Load initial pageSize from storage
	const loadFromStorage = useCallback((): { pageSize: number } | null => {
		if (!storageKey) return null;
		return storage.get<{ pageSize: number }>(storageKey);
	}, [storageKey, storage]);

	// Initialize state
	const storedState = loadFromStorage();
	const [currentPage, setCurrentPage] = useState(initialPage);
	const [pageSize, setPageSizeState] = useState(storedState?.pageSize ?? initialPageSize);

	// Persist pageSize to storage whenever it changes
	useEffect(() => {
		if (!storageKey) return;
		storage.set(storageKey, { pageSize });
	}, [pageSize, storageKey, storage]);

	// Derived state
	const canGoPrevious = currentPage > 1;
	const canGoNext = useCallback(
		(totalPages?: number) => {
			if (totalPages === undefined) return true; // Unknown total, allow next
			return currentPage < totalPages;
		},
		[currentPage]
	);

	// Frozen state (memoized, stable reference for useEffect deps)
	// CRITICAL: This is the key to avoiding infinite loops in Data2
	const fstate = useMemo(
		() => ({
			currentPage,
			pageSize,
			canGoPrevious,
			canGoNext,
		}),
		[currentPage, pageSize, canGoPrevious, canGoNext]
	);

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			setPage: (page: number) => {
				if (page < 1) return;
				setCurrentPage(page);
			},
			setPageSize: (newSize: number) => {
				if (newSize < 1) return;
				setPageSizeState(newSize);
				setCurrentPage(1); // Reset to page 1 when page size changes
			},
			nextPage: () => {
				setCurrentPage(prev => prev + 1);
			},
			previousPage: () => {
				setCurrentPage(prev => Math.max(1, prev - 1));
			},
			resetPage: () => {
				setCurrentPage(initialPage);
			},
		}),
		[initialPage]
	);

	// Fill backend query parameters
	const fillQuery = useCallback(
		(query: Record<string, unknown>) => {
			query.page = currentPage;
			query.pageSize = pageSize;
		},
		[currentPage, pageSize]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
