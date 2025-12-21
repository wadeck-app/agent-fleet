import { useCallback, useEffect, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';

/**
 * ===========================================================================================
 * USE PAGINATION - Composable Hook
 * ===========================================================================================
 *
 * Generic pagination state management hook.
 * Can be used with tables, grids, carousels, lists, or any paginated UI.
 *
 * Features:
 * - Current page state management
 * - Dynamic page size with setPageSize
 * - Navigation helpers (next, previous, goToPage)
 * - Optional localStorage persistence via StorageAdapter
 * - SSR-safe storage handling
 * - Works with backend or frontend pagination
 *
 * Example usage:
 * ```typescript
 * // Table with pagination and persistence
 * const pagination = usePagination({ pageSize: 10, storageId: 'books' });
 *
 * // Carousel with pagination (no persistence)
 * const carousel = usePagination({ pageSize: 1, initialPage: 0 });
 *
 * // Grid with pagination and custom storage
 * const grid = usePagination({ pageSize: 20, storageId: 'products', storage: customAdapter });
 * ```
 *
 * ===========================================================================================
 */

export interface UsePaginationOptions {
	/** Number of items per page (initial value) */
	pageSize: number;
	/** Initial page (default: 1) */
	initialPage?: number;
	/** Storage ID for persistence (e.g., 'books', 'products'). If provided, appends '-pagination' */
	storageId?: string;
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

export interface UsePaginationResult {
	/** Current page number (1-indexed) */
	currentPage: number;
	/** Number of items per page */
	pageSize: number;
	/** Set current page */
	setPage: (page: number) => void;
	/** Set page size (automatically resets to page 1) */
	setPageSize: (size: number) => void;
	/** Go to next page */
	nextPage: () => void;
	/** Go to previous page */
	previousPage: () => void;
	/** Reset to first page */
	resetPage: () => void;
	/** Check if can go to previous page */
	canGoPrevious: boolean;
	/** Check if can go to next page (requires totalPages) */
	canGoNext: (totalPages?: number) => boolean;
}

export function usePagination(options: UsePaginationOptions): UsePaginationResult {
	const { pageSize: initialPageSize, initialPage = 1, storageId, storage = defaultStorage } = options;

	// Storage key for pagination state
	const storageKey = storageId ? `${storageId}-pagination` : null;

	// Load initial state from storage
	const loadFromStorage = useCallback((): { pageSize: number } | null => {
		if (!storageKey) return null;
		return storage.get<{ pageSize: number }>(storageKey);
	}, [storageKey, storage]);

	// Initialize pageSize from storage or use initial value
	const storedState = loadFromStorage();
	const [pageSize, setPageSizeState] = useState(storedState?.pageSize ?? initialPageSize);
	const [currentPage, setCurrentPage] = useState(initialPage);

	// Save pageSize to storage whenever it changes
	useEffect(() => {
		if (!storageKey) return;
		storage.set(storageKey, { pageSize });
	}, [pageSize, storageKey, storage]);

	const setPage = useCallback((page: number) => {
		if (page < 1) return;
		setCurrentPage(page);
	}, []);

	const setPageSize = useCallback((newSize: number) => {
		if (newSize < 1) return;
		setPageSizeState(newSize);
		setCurrentPage(1); // Reset to page 1 when page size changes
	}, []);

	const nextPage = useCallback(() => {
		setCurrentPage(prev => prev + 1);
	}, []);

	const previousPage = useCallback(() => {
		setCurrentPage(prev => Math.max(1, prev - 1));
	}, []);

	const resetPage = useCallback(() => {
		setCurrentPage(initialPage);
	}, [initialPage]);

	const canGoPrevious = currentPage > 1;

	const canGoNext = useCallback(
		(totalPages?: number) => {
			if (totalPages === undefined) return true; // Unknown total, allow next
			return currentPage < totalPages;
		},
		[currentPage]
	);

	return {
		currentPage,
		pageSize,
		setPage,
		setPageSize,
		nextPage,
		previousPage,
		resetPage,
		canGoPrevious,
		canGoNext,
	};
}
