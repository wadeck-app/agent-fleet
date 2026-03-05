import { useState } from 'react';

/**
 * ===========================================================================================
 * USE PAGINATION FEATURE - Pagination Feature Hook
 * ===========================================================================================
 *
 * React hook that provides pagination state management for data tables.
 * Returns a typed feature object that widgets can consume.
 *
 * Usage:
 * ```tsx
 * const pagination = usePaginationFeature({ defaultSize: 20, pageSizes: [10, 20, 50] });
 * <HookDataTable features={[pagination, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface PaginationFeatureHook {
	type: 'pagination';
	page: number;
	pageSize: number;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	pageSizes?: number[];
}

export interface UsePaginationFeatureConfig {
	defaultSize?: number;
	pageSizes?: number[];
}

export function usePaginationFeature(config?: UsePaginationFeatureConfig): PaginationFeatureHook {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(config?.defaultSize ?? 10);

	return {
		type: 'pagination',
		page,
		pageSize,
		setPage,
		setPageSize: (size: number) => {
			setPageSize(size);
			// Reset to page 1 when page size changes
			setPage(1);
		},
		pageSizes: config?.pageSizes,
	};
}
