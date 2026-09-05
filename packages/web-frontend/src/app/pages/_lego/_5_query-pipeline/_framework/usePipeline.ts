import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';

import type { BaseQuery, QueryModifier } from './PipelineTypes';

/**
 * ===========================================================================================
 * USE PIPELINE HOOK
 * ===========================================================================================
 *
 * Core hook for the query-modifier pipeline approach.
 *
 * Takes:
 * - modifiers: Array of QueryModifier functions
 * - service: Service with getProducts method
 *
 * Returns:
 * - items: Fetched data
 * - loading: Loading state
 * - error: Error message
 * - pagination: Pagination metadata
 * - query: Final computed query (after all modifiers)
 * - refresh: Function to force refetch
 *
 * Flow:
 * 1. Applies modifiers sequentially to build final query
 * 2. Fetches data using the final query
 * 3. Re-fetches when modifiers change
 *
 * ===========================================================================================
 */

export interface PipelineResult<T> {
	items: T[];
	loading: boolean;
	error: string | null;
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
	query: BaseQuery;
	refresh: () => Promise<void>;
	setSearch: (value: string) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
}

export interface PipelineService {
	getProducts: (params?: any) => Promise<{
		items: any[];
		pagination?: {
			page: number;
			pageSize: number;
			total: number;
			totalPages: number;
		};
	}>;
}

export function usePipeline<T>(modifiers: QueryModifier[], service: PipelineService): PipelineResult<T> {
	const [items, setItems] = useState<T[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 10,
		total: 0,
		totalPages: 0,
	});
	// Interactive overrides -- applied after modifiers, reset page when search changes
	const [searchOverride, setSearchOverride] = useState<string | undefined>(undefined);
	const [pageOverride, setPageOverride] = useState<number | undefined>(undefined);
	const [pageSizeOverride, setPageSizeOverride] = useState<number | undefined>(undefined);
	const prevSearchRef = useRef<string | undefined>(undefined);

	const query = useMemo(() => {
		const base = modifiers.reduce((acc, modifier) => modifier(acc), {} as BaseQuery);
		// Apply overrides
		const result = { ...base };
		if (searchOverride !== undefined) {
			result.search = searchOverride;
			// Reset page to 1 when search changes
			if (searchOverride !== prevSearchRef.current) {
				result.page = 1;
			}
		}
		if (pageOverride !== undefined) {
			result.page = pageOverride;
		}
		if (pageSizeOverride !== undefined) {
			result.pageSize = pageSizeOverride;
		}
		return result;
	}, [modifiers, searchOverride, pageOverride, pageSizeOverride]);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await service.getProducts(query);
			setItems(response.items as T[]);
			setPagination(
				response.pagination ?? {
					page: 1,
					pageSize: 10,
					total: 0,
					totalPages: 0,
				}
			);
		} catch (err) {
			setError(getErrorMessage(err));
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, [service, query]);

	useEffect(() => {
		void fetchData();
	}, [fetchData]);

	const setSearch = useCallback(
		(value: string) => {
			prevSearchRef.current = searchOverride;
			setSearchOverride(value);
		},
		[searchOverride]
	);

	const setPage = useCallback((page: number) => {
		setPageOverride(page);
	}, []);

	const setPageSize = useCallback((pageSize: number) => {
		setPageSizeOverride(pageSize);
		setPageOverride(1);
	}, []);

	return {
		items,
		loading,
		error,
		pagination,
		query,
		refresh: fetchData,
		setSearch,
		setPage,
		setPageSize,
	};
}
