import { useCallback, useEffect, useState } from 'react';

import type { WidgetQueryState } from './useWidgetQuery';

/**
 * ===========================================================================================
 * USE WIDGET DATA FETCH - Data Fetching Hook
 * ===========================================================================================
 *
 * Manages data fetching for widgets based on query state.
 * Auto-fetches when query changes, handles loading/error states.
 *
 * Features:
 * - Automatic refetch on query change
 * - Loading and error state management
 * - Pagination metadata extraction
 * - Manual refresh function
 *
 * Usage:
 * ```tsx
 * const { items, loading, error, total, pagination, refresh } = useWidgetDataFetch({
 *   fetchFn: (query) => service.getProducts(query),
 *   query,
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface PaginationData {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface UseWidgetDataFetchParams<T> {
	fetchFn: (query: WidgetQueryState) => Promise<{
		items: T[];
		total?: number;
		page?: number;
		pageSize?: number;
		pagination?: { total: number; page: number; pageSize: number; totalPages: number };
	}>;
	query: WidgetQueryState;
}

export interface UseWidgetDataFetchResult<T> {
	items: T[];
	loading: boolean;
	error: Error | null;
	total: number;
	pagination: PaginationData;
	refresh: () => void;
}

export function useWidgetDataFetch<T>({ fetchFn, query }: UseWidgetDataFetchParams<T>): UseWidgetDataFetchResult<T> {
	const [items, setItems] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [total, setTotal] = useState(0);
	const [paginationData, setPaginationData] = useState<PaginationData>({
		page: 1,
		pageSize: 10,
		total: 0,
		totalPages: 0,
	});

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const response = await fetchFn(query);
			setItems(response.items);
			const total = response.total ?? response.pagination?.total ?? 0;
			const page = response.page ?? response.pagination?.page ?? 1;
			const pageSize = response.pageSize ?? response.pagination?.pageSize ?? 10;
			const totalPages = Math.ceil(total / pageSize);
			setTotal(total);
			setPaginationData({ page, pageSize, total, totalPages });
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
			setItems([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [fetchFn, query]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return {
		items,
		loading,
		error,
		total,
		pagination: paginationData,
		refresh: fetchData,
	};
}
