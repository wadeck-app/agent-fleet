import { useCallback, useEffect, useState } from 'react';

/**
 * ===========================================================================================
 * USE TABLE DATA FETCH - Data Fetching Hook
 * ===========================================================================================
 *
 * Manages data fetching for DataTable based on query state.
 * Auto-fetches when query changes, handles loading/error states.
 *
 * Reuses the pattern from Approach 1 (useWidgetDataFetch) but with a clearer name.
 *
 * Features:
 * - Automatic refetch on query change
 * - Loading and error state management
 * - Pagination metadata extraction
 * - Manual refresh function
 *
 * Usage:
 * ```tsx
 * const { items, loading, pagination, refresh } = useTableDataFetch({
 *   fetchFn: (query) => service.getProducts(query),
 *   query,
 * });
 * ```
 *
 * ===========================================================================================
 */

export interface QueryState {
	search: string;
	page: number;
	pageSize: number;
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
}

export interface PaginationData {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface UseTableDataFetchParams<T> {
	fetchFn: (query: QueryState) => Promise<{
		items: T[];
		total?: number;
		page?: number;
		pageSize?: number;
		pagination?: { total: number; page: number; pageSize: number; totalPages: number };
	}>;
	query: QueryState;
}

export interface UseTableDataFetchResult<T> {
	items: T[];
	loading: boolean;
	error: Error | null;
	pagination: PaginationData;
	refresh: () => void;
}

export function useTableDataFetch<T>({ fetchFn, query }: UseTableDataFetchParams<T>): UseTableDataFetchResult<T> {
	const [items, setItems] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
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
			setPaginationData({ page, pageSize, total, totalPages });
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
			setItems([]);
			setPaginationData({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
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
		pagination: paginationData,
		refresh: fetchData,
	};
}
