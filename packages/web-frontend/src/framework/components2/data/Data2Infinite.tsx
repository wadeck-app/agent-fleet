import { type ReactNode, useMemo } from 'react';

import { useDataAccumulator } from '@framework/hooks/data/useDataAccumulator';
import type { InfinitePaginationContract } from '@framework/hooks/data/useInfinitePagination';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';

import { Data, type DataProps } from './Data';

/
  
  DATA INFINITE - Decorator Pattern for Infinite Scroll
  
 
  Philosophy: Wrap Data without modifying it. Use a decorator hook to intercept
              and transform data after Data fetches it.
 
  Key Benefits:
  - Zero modifications to Data or useDataFetch (% backwards compatible)
  - Clean separation of concerns (SRP)
  - Highly composable (can stack multiple decorators)
  - Easy to add more decorators (caching, throttling, filtering)
 
  Architecture:
  Data fetches data (page N) → useDataAccumulator decorator intercepts
  → Accumulates with previous data → Children receive accumulated data
 
  Pattern: Decorator
  Composability: /
 /

/
  Props for DataInfinite component
 /
export interface DataInfiniteProps<T> extends Omit<DataProps<T>, 'children' | 'pagination'> {
	/ Infinite scroll pagination contract /
	infinitePagination: InfinitePaginationContract;

	/ Deduplication key extractor (optional) /
	deduplicateBy?: (item: T) => string | number;

	/ Children as render prop (receives accumulated data) /
	children: (props: QueryResultDisplayerProps<T>) => ReactNode;
}

/
  Internal component that handles data accumulation.
  This is a separate component to ensure hooks are called at the top level.
 /
interface DataAccumulatorWrapperProps<T> {
	props: QueryResultDisplayerProps<T>;
	deduplicateBy?: (item: T) => string | number;
	onReset: () => void;
	children: (props: QueryResultDisplayerProps<T>) => ReactNode;
}

function DataAccumulatorWrapper<T>({ props, deduplicateBy, onReset, children }: DataAccumulatorWrapperProps<T>) {
	// DECORATOR: Accumulate data before passing to children
	const accumulatedState = useDataAccumulator(
		{
			data: props.data,
			isLoading: props.isLoading,
			error: props.error,
			paginationData: null,
			isRefreshing: props.refreshing ?? false,
		},
		{
			enabled: true,
			deduplicateBy,
			onReset,
		}
	);

	// Pass accumulated data to children
	return <>{children({ ...props, data: accumulatedState.data })}</>;
}

/
  Data wrapper that adds infinite scroll accumulation using decorator pattern.
 
  This component wraps Data without modifying it. It uses render props to
  intercept data, apply accumulation via useDataAccumulator, then pass to children.
 
  @example
  ```tsx
  const infinitePagination = useInfinitePagination({ pageSize: , hasMore: true });
 
  <DataInfinite
    fetchData={fetchIngredients}
    infinitePagination={infinitePagination}
    sorting={sorting}
    search={search}
    deduplicateBy={item => item.id}
  >
    {(props) => (
      <IngredientCarousel
        data={props.data}
        isLoading={props.isLoading}
        sorting={props.sorting}
      />
    )}
  </DataInfinite>
  ```
 
  @example Stacking decorators
  ```tsx
  <DataInfinite ...>
    {(props) => {
      // Add more decorators here
      const cached = useDataCache(props.data, { ttl:  });
      const filtered = useDataFilter(cached, { predicate: item => item.active });
      return <Table data={filtered} />;
    }}
  </DataInfinite>
  ```
 /
export function DataInfinite<T>({
	infinitePagination,
	deduplicateBy,
	children,
	...dataProps
}: DataInfiniteProps<T>) {
	// 
	// ADAPTER: Convert infinite pagination to regular pagination contract
	// 

	const paginationAdapter = useMemo(
		() => ({
			fstate: {
				currentPage: infinitePagination.fstate.currentPage,
				page: infinitePagination.fstate.currentPage,
				pageSize: infinitePagination.fstate.pageSize,
				canGoPrevious: infinitePagination.fstate.currentPage > 1,
				canGoNext: () => infinitePagination.fstate.hasMore,
			},
			actions: {
				setPage: infinitePagination.actions.loadNext,
				setPageSize: infinitePagination.actions.setPageSize,
				resetPage: infinitePagination.actions.reset,
			},
			fillQuery: infinitePagination.fillQuery,
		}),
		[infinitePagination]
	);

	// 
	// RENDER: Wrap Data with decorator
	// 

	return (
		<Data {...dataProps} pagination={paginationAdapter}>
			{props => (
				<DataAccumulatorWrapper
					props={props}
					deduplicateBy={deduplicateBy}
					onReset={infinitePagination.actions.reset}
				>
					{children}
				</DataAccumulatorWrapper>
			)}
		</Data>
	);
}
