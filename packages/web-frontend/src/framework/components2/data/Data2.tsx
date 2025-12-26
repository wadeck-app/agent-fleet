import { type ReactElement, type ReactNode, cloneElement, useEffect, useMemo, useState } from 'react';

import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import type { PaginationContract } from '@framework/hooks2/usePagination2';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import type { FeatureContract } from '@framework/types/FeatureContract';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { SearchContract } from '@framework/types/contracts/SearchContract';
import { type ComposedQuery, buildQuery } from '@framework/utils2/buildQuery';

/**
 * ===========================================================================================
 * DATA2 - Headless Data Orchestration Shell
 * ===========================================================================================
 *
 * Generic data-fetching orchestrator that composes features and injects props into children.
 * This is the glue that makes the entire headless composable architecture work.
 *
 * Key responsibilities:
 * - Compose feature queries using buildQuery()
 * - Fetch data when query changes (using URL as source of truth)
 * - Manage loading/error states
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
 * Backend pagination data returned by API
 */
export interface PaginationData {
	/** Total number of items across all pages */
	total: number;
	/** Current page number (1-indexed) */
	page: number;
	/** Number of items per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Props for Data2 component
 *
 * Accepts feature contracts directly and uses buildQuery() to compose them.
 * Each feature fills the query independently via fillQuery().
 *
 * @template T - Type of data items
 */
export interface Data2Props<T> {
	/**
	 * Function to fetch data given a query.
	 * Should return { items: T[], pagination?: PaginationData }
	 */
	fetchData: (query: ComposedQuery) => Promise<{
		items: T[];
		pagination?: PaginationData;
	}>;

	/** Pagination feature contract (optional) */
	pagination?: PaginationContract | null;
	/** Sorting feature contract (optional) */
	sorting?: SortingContract | null;
	/** Search feature contract (optional) */
	search?: SearchContract | null;
	/** Filter feature contract (optional) */
	filter?: FilterContract | null;
	/** Cache control feature contract (optional) */
	cache?: FeatureContract<any> | null;

	/**
	 * Children: either ReactElement (for cloneElement) or render prop function
	 */
	children: ReactElement<QueryResultDisplayerProps<T>> | ((props: QueryResultDisplayerProps<T>) => ReactNode);

	/** Custom loading component (optional) */
	loadingComponent?: ReactNode;

	/** Custom error component (optional) */
	errorComponent?: (error: string) => ReactNode;
}

/**
 * Headless data orchestration shell.
 * Composes multiple feature contracts into a single query and fetches data.
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
	children,
	loadingComponent,
	errorComponent,
}: Data2Props<T>) {
	// Data state
	const [data, setData] = useState<T[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [paginationData, setPaginationData] = useState<PaginationData | null>(null);
	// Track if we have previous data - used to determine if this is a refresh
	const [hadPreviousData, setHadPreviousData] = useState(false);

	// Compose query from features
	// This memoizes to prevent unnecessary refetches
	const query: ComposedQuery = useMemo(() => {
		try {
			return buildQuery(
				pagination?.fillQuery,
				sorting?.fillQuery,
				search?.fillQuery,
				filter?.fillQuery,
				cache?.fillQuery
			);
		} catch (err) {
			console.error('Failed to build query:', err);
			throw err;
		}
	}, [pagination?.fillQuery, sorting?.fillQuery, search?.fillQuery, filter?.fillQuery, cache?.fillQuery]);

	// Convert query to URL string for cache busting (source of truth)
	// Simple approach: serialize query to JSON, so any change in query = different URL
	const queryUrl = useMemo(() => {
		// Sort keys for consistent ordering, so { a: 1, b: 2 } === { b: 2, a: 1 }
		const sortedQuery = Object.keys(query as Record<string, unknown>)
			.sort()
			.reduce((acc: Record<string, unknown>, key) => {
				acc[key] = (query as Record<string, unknown>)[key];
				return acc;
			}, {});
		const url = JSON.stringify(sortedQuery);
		console.log('[Data2] queryUrl computed:', url);
		return url;
	}, [query]);

	// Fetch data whenever URL changes
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		console.log('[Data2] useEffect triggered with queryUrl:', queryUrl);
		const abortController = new AbortController();

		(async () => {
			try {
				console.log('[Data2] Fetching data with query:', query);
				setIsLoading(true);
				setError(null);

				// Fetch data
				const result = await fetchData(query);

				// Update state if not aborted
				if (!abortController.signal.aborted) {
					console.log('[Data2] Fetch successful, got', result.items.length, 'items');
					setData(result.items);
					setPaginationData(result.pagination ?? null);
					setHadPreviousData(true);
				}
			} catch (err) {
				// Handle error if not aborted
				if (!abortController.signal.aborted) {
					console.error('[Data2] Fetch error:', err);
					setError(err instanceof Error ? err.message : 'Failed to fetch data');
				}
			} finally {
				// Clear loading state if not aborted
				if (!abortController.signal.aborted) {
					console.log('[Data2] Setting isLoading to false');
					setIsLoading(false);
				}
			}
		})();

		// Cleanup: abort fetch on unmount or when URL changes
		return () => {
			console.log('[Data2] Cleanup: aborting previous fetch');
			abortController.abort();
		};
		// Dependencies: only queryUrl (the URL representation)
		// When any feature changes in a way that affects query, queryUrl changes, and we refetch
		// We don't list 'query' directly because queryUrl is memoized from query
		// So any change to query is reflected in queryUrl
	}, [fetchData, query, queryUrl]);

	// Calculate refreshing state: true if loading but we already have data
	// (i.e., this is a refresh, not an initial load)
	const isRefreshing = isLoading && hadPreviousData && data.length > 0;

	// Build props to inject into children
	// Use feature states directly
	const injectedProps: QueryResultDisplayerProps<T> = useMemo(() => {
		const props: QueryResultDisplayerProps<T> = {
			data,
			isLoading,
			error,
		};

		// Add pagination props if feature enabled
		if (pagination && pagination.actions && paginationData) {
			props.pagination = {
				currentPage: paginationData.page,
				totalPages: paginationData.totalPages,
				totalItems: paginationData.total,
				pageSize: paginationData.pageSize,
				onPageChange: pagination.actions.setPage,
				onPageSizeChange: pagination.actions.setPageSize,
				// Use pageSizeOptions from hook if provided, otherwise default to [5, 10, 20, 50]
				pageSizeOptions: pagination.fstate?.pageSizeOptions ?? [5, 10, 20, 50],
			};
		}

		// Add sorting props if feature enabled
		if (sorting && sorting.actions && sorting.fstate) {
			props.sorting = {
				sortConfigs: sorting.fstate.sortConfigs,
				onSortChange: sorting.actions.handleSort,
			};
		}

		// Add custom features state
		props.features = {
			search: search?.fstate,
			filter: filter?.fstate,
		};

		// Add refreshing state
		props.refreshing = isRefreshing;

		return props;
		// Depend on feature states and isRefreshing
	}, [data, isLoading, error, paginationData, pagination, sorting, search, filter, isRefreshing]); // eslint-disable-line no-restricted-syntax

	// Handle initial loading state (before first data)
	if (isLoading && data.length === 0) {
		if (loadingComponent) {
			return <>{loadingComponent}</>;
		}
		return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
	}

	// Handle error state
	if (error && !isLoading) {
		if (errorComponent) {
			return <>{errorComponent(error)}</>;
		}
		return (
			<div className="p-4 text-center text-destructive">
				<p className="font-semibold">Error loading data</p>
				<p className="text-sm">{error}</p>
			</div>
		);
	}

	// Render children (cloneElement OR render prop)
	if (typeof children === 'function') {
		// Render prop pattern
		return <>{children(injectedProps)}</>;
	}

	// cloneElement pattern
	return cloneElement(children, injectedProps);
}
