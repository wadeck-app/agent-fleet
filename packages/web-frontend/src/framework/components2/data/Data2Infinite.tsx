import { type ReactNode, useMemo } from 'react';

import { useDataAccumulator } from '@framework/hooks2/data/useDataAccumulator';
import type { InfinitePaginationContract } from '@framework/hooks2/data/useInfinitePagination';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';

import { Data2, type Data2Props } from './Data2';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * DATA2 INFINITE - Decorator Pattern for Infinite Scroll
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Philosophy: Wrap Data2 without modifying it. Use a decorator hook to intercept
 *             and transform data after Data2 fetches it.
 *
 * Key Benefits:
 * - Zero modifications to Data2 or useDataFetch (100% backwards compatible)
 * - Clean separation of concerns (SRP)
 * - Highly composable (can stack multiple decorators)
 * - Easy to add more decorators (caching, throttling, filtering)
 *
 * Architecture:
 * Data2 fetches data (page N) → useDataAccumulator decorator intercepts
 * → Accumulates with previous data → Children receive accumulated data
 *
 * Pattern: Decorator
 * Composability: 9/10
 */

/**
 * Props for Data2Infinite component
 */
export interface Data2InfiniteProps<T> extends Omit<Data2Props<T>, 'children' | 'pagination'> {
	/** Infinite scroll pagination contract */
	infinitePagination: InfinitePaginationContract;

	/** Deduplication key extractor (optional) */
	deduplicateBy?: (item: T) => string | number;

	/** Children as render prop (receives accumulated data) */
	children: (props: QueryResultDisplayerProps<T>) => ReactNode;
}

/**
 * Internal component that handles data accumulation.
 * This is a separate component to ensure hooks are called at the top level.
 */
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

/**
 * Data2 wrapper that adds infinite scroll accumulation using decorator pattern.
 *
 * This component wraps Data2 without modifying it. It uses render props to
 * intercept data, apply accumulation via useDataAccumulator, then pass to children.
 *
 * @example
 * ```tsx
 * const infinitePagination = useInfinitePagination({ pageSize: 12, hasMore: true });
 *
 * <Data2Infinite
 *   fetchData={fetchIngredients}
 *   infinitePagination={infinitePagination}
 *   sorting={sorting}
 *   search={search}
 *   deduplicateBy={item => item.id}
 * >
 *   {(props) => (
 *     <IngredientCarousel
 *       data={props.data}
 *       isLoading={props.isLoading}
 *       sorting={props.sorting}
 *     />
 *   )}
 * </Data2Infinite>
 * ```
 *
 * @example Stacking decorators
 * ```tsx
 * <Data2Infinite ...>
 *   {(props) => {
 *     // Add more decorators here
 *     const cached = useDataCache(props.data, { ttl: 60000 });
 *     const filtered = useDataFilter(cached, { predicate: item => item.active });
 *     return <Table data={filtered} />;
 *   }}
 * </Data2Infinite>
 * ```
 */
export function Data2Infinite<T>({
	infinitePagination,
	deduplicateBy,
	children,
	...data2Props
}: Data2InfiniteProps<T>) {
	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ADAPTER: Convert infinite pagination to regular pagination contract
	// ═══════════════════════════════════════════════════════════════════════════════════════

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

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// RENDER: Wrap Data2 with decorator
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return (
		<Data2 {...data2Props} pagination={paginationAdapter}>
			{props => (
				<DataAccumulatorWrapper
					props={props}
					deduplicateBy={deduplicateBy}
					onReset={infinitePagination.actions.reset}
				>
					{children}
				</DataAccumulatorWrapper>
			)}
		</Data2>
	);
}
