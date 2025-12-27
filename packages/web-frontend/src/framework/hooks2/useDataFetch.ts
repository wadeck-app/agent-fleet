import { useCallback, useEffect, useRef, useState } from 'react';

import type { MutationContract, MutationMethods } from '@framework/types/MutationContract';
import type { ComposedQuery } from '@framework/utils2/buildQuery';

/**
 * ===========================================================================================
 * USE DATA FETCH - Data Fetching Lifecycle Hook
 * ===========================================================================================
 *
 * Manages the complete data fetching lifecycle:
 * - Loading states (initial load vs refresh)
 * - Error handling
 * - Abort logic (cleanup on unmount or query change)
 * - Pagination metadata
 *
 * Key responsibilities:
 * - Execute fetchData whenever queryUrl changes (source of truth)
 * - Track loading/error states
 * - Distinguish between initial load and refresh (for UI feedback)
 * - Cleanup aborted requests
 *
 * Example usage:
 * ```typescript
 * const dataState = useDataFetch(queryUrl, query, async (query) => {
 *   const response = await api.getItems(query);
 *   return { items: response.items, pagination: response.pagination };
 * });
 *
 * // dataState: { data, isLoading, error, paginationData, isRefreshing }
 * ```
 *
 * ===========================================================================================
 */

/**
 * Backend pagination data returned by API.
 */
export interface PaginationData {
	/** Total number of items across all pages */
	total: number;
	/** Current page number (1-indexed) */
	page: number;
	/** Number of items per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Result returned by fetchData function.
 */
export interface FetchDataResult<T> {
	/** Array of data items */
	items: T[];
	/** Optional pagination metadata from backend */
	pagination?: PaginationData;
}

/**
 * State returned by useDataFetch hook.
 */
export interface UseDataFetchState<T> {
	/** Current data items */
	data: T[];
	/** Is currently loading? */
	isLoading: boolean;
	/** Error message (null if no error) */
	error: string | null;
	/** Pagination metadata from backend */
	paginationData: PaginationData | null;
	/** Is this a refresh? (loading but we already have data) */
	isRefreshing: boolean;
	/** Optional mutation methods (available when mutation contract is provided) */
	mutation?: MutationMethods<T>;
}

/**
 * Handles data fetching with loading/error states and abort logic.
 * Refetches whenever queryUrl changes (source of truth).
 *
 * @param queryUrl - Stable string representation of query (for change detection)
 * @param query - Actual query object to pass to fetchData
 * @param fetchData - Function to fetch data given a query
 * @param mutation - Optional mutation contract for cache mutations
 * @returns Data state (data, isLoading, error, paginationData, isRefreshing, mutation?)
 */
export function useDataFetch<T>(
	queryUrl: string,
	query: ComposedQuery,
	fetchData: (query: ComposedQuery) => Promise<FetchDataResult<T>>,
	mutation?: MutationContract<T>
): UseDataFetchState<T> {
	const [data, setData] = useState<T[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [paginationData, setPaginationData] = useState<PaginationData | null>(null);
	// Track if we have previous data (to distinguish initial load from refresh)
	const [hadPreviousData, setHadPreviousData] = useState(false);

	// DEV MODE: Warn if fetchData changes (should be memoized with useCallback)
	const fetchDataRef = useRef(fetchData);
	if (process.env.NODE_ENV === 'development' && fetchDataRef.current !== fetchData) {
		console.warn(
			'[useDataFetch] fetchData function changed! This may cause unexpected behavior. ' +
				'Ensure fetchData is wrapped with useCallback.'
		);
		fetchDataRef.current = fetchData;
	}

	// Mutation methods (only if mutation contract provided)
	const updateItem = useCallback(
		(updatedItem: T) => {
			if (!mutation) {
				return;
			}

			setData(prev =>
				prev.map(item =>
					mutation.keyExtractor(item) === mutation.keyExtractor(updatedItem) ? updatedItem : item
				)
			);

			// Optional callback
			mutation.onUpdate?.(updatedItem);
		},
		[mutation]
	);

	const addItem = useCallback(
		(newItem: T) => {
			if (!mutation) {
				return;
			}

			setData(prev => [...prev, newItem]);

			// Optional callback
			mutation.onAdd?.(newItem);
		},
		[mutation]
	);

	const removeItem = useCallback(
		(itemId: string | number) => {
			if (!mutation) {
				return;
			}

			setData(prev => prev.filter(item => mutation.keyExtractor(item) !== itemId));

			// Optional callback
			mutation.onRemove?.(itemId);
		},
		[mutation]
	);

	const mutationMethods: MutationMethods<T> | undefined = mutation ? { updateItem, addItem, removeItem } : undefined;

	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);

				// Fetch data
				const result = await fetchData(query);

				// Update state if not aborted
				if (!abortController.signal.aborted) {
					setData(result.items);
					setPaginationData(result.pagination ?? null);
					setHadPreviousData(true);
				}
			} catch (err) {
				// Handle error if not aborted
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err.message : 'Failed to fetch data');
				}
			} finally {
				// Clear loading state if not aborted
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		})();

		// Cleanup: abort fetch on unmount or when queryUrl changes
		return () => {
			abortController.abort();
		};
		// IMPORTANT: Only depend on queryUrl (source of truth for change detection)
		// query and fetchData are captured via closure and should be stable
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queryUrl]);

	// Calculate refreshing state: true if loading but we already have data
	// (i.e., this is a refresh, not an initial load)
	const isRefreshing = isLoading && hadPreviousData && data.length > 0;

	return {
		data,
		isLoading,
		error,
		paginationData,
		isRefreshing,
		mutation: mutationMethods,
	};
}
