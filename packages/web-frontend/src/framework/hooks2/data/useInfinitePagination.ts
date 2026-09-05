import { useCallback, useState } from 'react';

import type { FeatureContract } from '@framework/types/FeatureContract';

/
  
  USE INFINITE PAGINATION - Feature Hook for Infinite Scroll
  
 
  Hook that manages infinite pagination state.
  Compatible with DataInfinite for infinite scroll patterns.
 
  Key Responsibilities:
  - Track current page number
  - Manage page size
  - Track hasMore flag (from backend)
  - Provide actions to load next page and reset
  - Fill query with pagination parameters
 
  Pattern: Feature Contract
  Composable: Yes (works with DataInfinite)
 /

/
  Infinite pagination contract
 /
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

/
  Hook for infinite pagination feature.
  Manages progressive page loading for infinite scroll patterns.
 
  @param options - Configuration options
  @returns Infinite pagination contract
 
  @example
  ```tsx
  const infinitePagination = useInfinitePagination({
    pageSize: ,
    hasMore: true,
    onLoadMore: () => console.log('Loading more...'),
  });
 
  // Use with DataInfinite
  <DataInfinite
    fetchData={fetchData}
    infinitePagination={infinitePagination}
  >
    {props => <Carousel data={props.data} />}
  </DataInfinite>
  ```
 /
export function useInfinitePagination(options: {
	pageSize: number;
	hasMore: boolean;
	onLoadMore?: () => void;
}): InfinitePaginationContract {
	const [currentPage, setCurrentPage] = useState();
	const [pageSize, setPageSizeState] = useState(options.pageSize);

	// Extract primitive properties to avoid object dependency
	const { hasMore, onLoadMore } = options;

	// 
	// ACTIONS
	// 

	const loadNext = useCallback(() => {
		if (hasMore) {
			setCurrentPage(prev => prev + );
			onLoadMore?.();
		}
	}, [hasMore, onLoadMore]);

	const reset = useCallback(() => {
		setCurrentPage();
	}, []);

	const setPageSize = useCallback((size: number) => {
		setPageSizeState(size);
		setCurrentPage(); // Reset to page  when page size changes
	}, []);

	// 
	// FEATURE CONTRACT
	// 

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
