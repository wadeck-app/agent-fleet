import { useCallback, useState } from 'react';

import { type PaginationConfig, resolveFeature } from '@framework/lego/types/FeatureTypes';

/**
 * ===========================================================================================
 * USE WIDGET QUERY - Internal Query State Management
 * ===========================================================================================
 *
 * Manages widget-internal query state (search, pagination, sorting).
 * Composes query object from feature configs and internal state.
 *
 * Features:
 * - Feature-driven initialization
 * - State setters for search, pagination, sorting
 * - Reset function to restore defaults
 * - No external side effects (pure state management)
 *
 * Usage:
 * ```tsx
 * const { query, setSearch, setPage, setPageSize, setSort, resetQuery } = useWidgetQuery(features);
 * ```
 *
 * ===========================================================================================
 */

export interface WidgetQueryState {
	search: string;
	page: number;
	pageSize: number;
	sortBy: string | undefined;
	sortOrder: 'asc' | 'desc' | undefined;
}

export interface UseWidgetQueryResult {
	query: WidgetQueryState;
	setSearch: (search: string) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	setSort: (sortBy: string | undefined, sortOrder: 'asc' | 'desc' | undefined) => void;
	resetQuery: () => void;
}

/**
 * Hook to manage widget query state based on features
 */
export function useWidgetQuery(features: unknown[]): UseWidgetQueryResult {
	const paginationConfig = features
		.map(f => resolveFeature<PaginationConfig>(f as string | PaginationConfig, 'pagination'))
		.find(Boolean);
	const defaultPageSize = paginationConfig?.defaultPageSize || 10;

	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(defaultPageSize);
	const [sortBy, setSortBy] = useState<string | undefined>(undefined);
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined);

	const query: WidgetQueryState = {
		search,
		page,
		pageSize,
		sortBy,
		sortOrder,
	};

	const setSort = useCallback((newSortBy: string | undefined, newSortOrder: 'asc' | 'desc' | undefined) => {
		setSortBy(newSortBy);
		setSortOrder(newSortOrder);
	}, []);

	const resetQuery = useCallback(() => {
		setSearch('');
		setPage(1);
		setPageSize(defaultPageSize);
		setSortBy(undefined);
		setSortOrder(undefined);
	}, [defaultPageSize]);

	return {
		query,
		setSearch: (newSearch: string) => {
			setSearch(newSearch);
			setPage(1);
		},
		setPage,
		setPageSize: (newPageSize: number) => {
			setPageSize(newPageSize);
			setPage(1);
		},
		setSort,
		resetQuery,
	};
}
