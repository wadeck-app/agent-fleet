import { useCallback, useState } from 'react';

import type { FeatureContract } from '@framework/types/FeatureContract';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * USE INFINITE PAGINATION - Feature Hook for Infinite Scroll
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Hook that manages infinite pagination state.
 * Compatible with Data2Infinite for infinite scroll patterns.
 *
 * Key Responsibilities:
 * - Track current page number
 * - Manage page size
 * - Track hasMore flag (from backend)
 * - Provide actions to load next page and reset
 * - Fill query with pagination parameters
 *
 * Pattern: Feature Contract
 * Composable: Yes (works with Data2Infinite)
 */

/**
 * Infinite pagination contract
 */
export interface InfinitePaginationContract extends FeatureContract<{
	currentPage: number;
	pageSize: number;
	hasMore: boolean;
}> {
	actions: {
		loadNext: () => void;
		reset: () => void;
		setPageSize: (size: number) => void;
	};
}

/**
 * Hook for infinite pagination feature.
 * Manages progressive page loading for infinite scroll patterns.
 *
 * @param options - Configuration options
 * @returns Infinite pagination contract
 *
 * @example
 * ```tsx
 * const infinitePagination = useInfinitePagination({
 *   pageSize: 12,
 *   hasMore: true,
 *   onLoadMore: () => console.log('Loading more...'),
 * });
 *
 * // Use with Data2Infinite
 * <Data2Infinite
 *   fetchData={fetchData}
 *   infinitePagination={infinitePagination}
 * >
 *   {props => <Carousel data={props.data} />}
 * </Data2Infinite>
 * ```
 */
export function useInfinitePagination(options: {
	pageSize: number;
	hasMore: boolean;
	onLoadMore?: () => void;
}): InfinitePaginationContract {
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSizeState] = useState(options.pageSize);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ACTIONS
	// ═══════════════════════════════════════════════════════════════════════════════════════

	const loadNext = useCallback(() => {
		if (options.hasMore) {
			setCurrentPage(prev => prev + 1);
			options.onLoadMore?.();
		}
	}, [options]);

	const reset = useCallback(() => {
		setCurrentPage(1);
	}, []);

	const setPageSize = useCallback((size: number) => {
		setPageSizeState(size);
		setCurrentPage(1); // Reset to page 1 when page size changes
	}, []);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// FEATURE CONTRACT
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return {
		fstate: {
			currentPage,
			pageSize,
			hasMore: options.hasMore,
		},
		actions: {
			loadNext,
			reset,
			setPageSize,
		},
		fillQuery: query => {
			query.page = currentPage;
			query.pageSize = pageSize;
		},
	};
}
