import { type ReactElement, type ReactNode, cloneElement } from 'react';

import { LoadingDots } from '@framework/components/loading/LoadingDots';
import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import { type FetchDataResult, useDataFetch } from '@framework/hooks2/useDataFetch';
import type { MultiSelectContract } from '@framework/hooks2/useMultiSelect2';
import type { PaginationContract } from '@framework/hooks2/usePagination2';
import { usePropsInjection } from '@framework/hooks2/usePropsInjection';
import { useQueryComposition } from '@framework/hooks2/useQueryComposition';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import type { FeatureContract } from '@framework/types/FeatureContract';
import type { MutationContract } from '@framework/types/MutationContract';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { SearchContract } from '@framework/types/contracts/SearchContract';
import type { ComposedQuery } from '@framework/utils2/buildQuery';

/**
 * ===========================================================================================
 * DATA2 - Headless Data Orchestration Shell (REFACTORED)
 * ===========================================================================================
 *
 * Generic data-fetching orchestrator that composes features and injects props into children.
 * This is the glue that makes the entire headless composable architecture work.
 *
 * Architecture (3-step process):
 * 1. useQueryComposition - Compose features into a single query
 * 2. useDataFetch - Fetch data with loading/error/abort logic
 * 3. usePropsInjection - Build props to inject into children
 *
 * Key responsibilities:
 * - Orchestrate specialized hooks (separation of concerns)
 * - Handle loading and error states (initial load vs refresh)
 * - Inject data + feature state into children (cloneElement OR render prop)
 *
 * Features are independent and optional:
 * - Add/remove features without breaking other features
 * - Features don't know about each other
 * - Each feature contributes to backend query via fillQuery()
 *
 * Query change detection:
 * - Uses URL representation as source of truth for cache busting
 * - Simple comparison: if URL changes, refetch
 * - Features are responsible for their own state management
 * - No cross-feature business logic in Data2
 *
 * ===========================================================================================
 */

/**
 * Props for Data2 component
 *
 * Accepts feature contracts directly and composes them via useQueryComposition.
 * Each feature fills the query independently via fillQuery().
 *
 * @template T - Type of data items
 */
export interface Data2Props<T> {
	/**
	 * Function to fetch data given a query.
	 * Should return { items: T[], pagination?: PaginationData }
	 */
	fetchData: (query: ComposedQuery) => Promise<FetchDataResult<T>>;

	/** Pagination feature contract (optional) */
	pagination?: PaginationContract | null;
	/** Sorting feature contract (optional) */
	sorting?: SortingContract | null;
	/** Search feature contract (optional) */
	search?: SearchContract | null;
	/** Filter feature contract (optional) */
	filter?: FilterContract | null;
	/** Cache control feature contract (optional) */
	cache?: FeatureContract<unknown> | null;
	/** Multi-selection feature contract (optional) */
	selection?: MultiSelectContract | null;
	/** Mutation feature contract (optional) - enables direct cache mutations */
	mutation?: MutationContract<T> | null;

	/**
	 * Children: either ReactElement (for cloneElement) or render prop function
	 */
	children: ReactElement<QueryResultDisplayerProps<T>> | ((props: QueryResultDisplayerProps<T>) => ReactNode);

	/** Custom loading component (optional) */
	loadingComponent?: ReactNode;

	/** Custom error component (optional) */
	errorComponent?: (error: string) => ReactNode;

	/**
	 * If true, Data2 delegates initial loading state to children.
	 * Use this when children implement custom skeleton loaders.
	 * Default: false (Data2 shows loading indicator)
	 */
	delegateLoadingToChildren?: boolean;
}

/**
 * Headless data orchestration shell (SIMPLIFIED).
 * Delegates logic to specialized hooks for better separation of concerns.
 *
 * @template T - Type of data items
 */
export function Data2<T>({
	fetchData,
	pagination,
	sorting,
	search,
	filter,
	cache,
	selection,
	mutation,
	children,
	loadingComponent,
	errorComponent,
	delegateLoadingToChildren = false,
}: Data2Props<T>) {
	// Step 1: Compose query from features
	// Pass features individually (not as array) to ensure stable dependencies
	const { query, queryUrl } = useQueryComposition({
		pagination,
		sorting,
		search,
		filter,
		cache,
	});

	// Step 2: Fetch data whenever query changes (with optional mutation support)
	const dataState = useDataFetch(queryUrl, query, fetchData, mutation ?? undefined);

	// Step 3: Build props to inject into children
	const injectedProps = usePropsInjection(dataState, {
		pagination,
		sorting,
		search,
		filter,
		selection,
	});

	// Handle initial loading state (before first data) - unless delegated to children
	if (!delegateLoadingToChildren && dataState.isLoading && dataState.data.length === 0) {
		if (loadingComponent) {
			return <>{loadingComponent}</>;
		}
		return (
			<div className="flex flex-col items-center justify-center p-12">
				<LoadingDots size="large" />
			</div>
		);
	}

	// Handle error state - unless delegated to children
	if (!delegateLoadingToChildren && dataState.error && !dataState.isLoading) {
		if (errorComponent) {
			return <>{errorComponent(dataState.error)}</>;
		}
		return (
			<div className="p-4 text-center text-destructive">
				<p className="font-semibold">Error loading data</p>
				<p className="text-sm">{dataState.error}</p>
			</div>
		);
	}

	// Render children (render prop OR cloneElement)
	if (typeof children === 'function') {
		return <>{children(injectedProps)}</>;
	}
	return cloneElement(children, injectedProps);
}
