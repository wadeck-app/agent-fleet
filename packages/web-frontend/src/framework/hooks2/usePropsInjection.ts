import { useMemo } from 'react';

import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import type { UseDataFetchState } from '@framework/hooks2/useDataFetch';
import type { MultiSelectContract } from '@framework/hooks2/useMultiSelect2';
import type { PaginationContract } from '@framework/hooks2/usePagination2';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { SearchContract } from '@framework/types/contracts/SearchContract';

/**
 * ===========================================================================================
 * USE PROPS INJECTION - Props Builder Hook
 * ===========================================================================================
 *
 * Builds props to inject into child components (Table2, Grid3, etc.) based on:
 * - Data state (data, loading, error, pagination metadata)
 * - Feature contracts (pagination, sorting, search, filter)
 *
 * Key responsibilities:
 * - Transform data state + feature contracts into QueryResultDisplayerProps
 * - Add pagination callbacks if pagination feature enabled
 * - Add sorting callbacks if sorting feature enabled
 * - Add custom feature states (search, filter)
 * - Memoize to prevent unnecessary re-renders
 *
 * Example usage:
 * ```typescript
 * const dataState = useDataFetch(queryUrl, query, fetchData);
 * const injectedProps = usePropsInjection(dataState, {
 *   pagination,
 *   sorting,
 *   search,
 *   filter,
 * });
 *
 * // injectedProps: { data, isLoading, error, pagination, sorting, features, refreshing }
 * ```
 *
 * ===========================================================================================
 */

/**
 * Features that can be injected into props.
 */
export interface InjectableFeatures {
	/** Pagination feature (optional) */
	pagination?: PaginationContract | null;
	/** Sorting feature (optional) */
	sorting?: SortingContract | null;
	/** Search feature (optional) */
	search?: SearchContract | null;
	/** Filter feature (optional) */
	filter?: FilterContract | null;
	/** Multi-selection feature (optional) */
	selection?: MultiSelectContract | null;
}

/**
 * Builds props to inject into child components based on data state and feature contracts.
 *
 * @param dataState - Data state from useDataFetch
 * @param features - Feature contracts (pagination, sorting, search, filter)
 * @returns Props to inject into QueryResultDisplayer components
 */
export function usePropsInjection<T>(
	dataState: UseDataFetchState<T>,
	features: InjectableFeatures
): QueryResultDisplayerProps<T> {
	return useMemo(() => {
		const props: QueryResultDisplayerProps<T> = {
			data: dataState.data,
			isLoading: dataState.isLoading,
			error: dataState.error,
			refreshing: dataState.isRefreshing,
			mutation: dataState.mutation, // Pass mutation methods through
		};

		// Add pagination props if feature enabled
		if (features.pagination && features.pagination.actions) {
			if (dataState.paginationData) {
				// Full pagination data available (after first fetch)
				props.pagination = {
					currentPage: dataState.paginationData.page,
					totalPages: dataState.paginationData.totalPages,
					totalItems: dataState.paginationData.total,
					pageSize: dataState.paginationData.pageSize,
					onPageChange: features.pagination.actions.setPage,
					onPageSizeChange: features.pagination.actions.setPageSize,
					pageSizeOptions: features.pagination.fstate?.pageSizeOptions ?? [5, 10, 20, 50],
				};
			} else if (features.pagination.fstate) {
				// Before first fetch: provide pageSize from feature state for skeleton loaders
				props.pagination = {
					currentPage: features.pagination.fstate.currentPage,
					totalPages: 1,
					totalItems: 0,
					pageSize: features.pagination.fstate.pageSize,
					onPageChange: features.pagination.actions.setPage,
					onPageSizeChange: features.pagination.actions.setPageSize,
					pageSizeOptions: features.pagination.fstate.pageSizeOptions ?? [5, 10, 20, 50],
				};
			}
		}

		// Add sorting props if feature enabled
		if (features.sorting && features.sorting.actions && features.sorting.fstate) {
			props.sorting = {
				sortConfigs: features.sorting.fstate.sortConfigs,
				onSortChange: features.sorting.actions.handleSort,
			};
		}

		// Add custom features state (search, filter, selection, etc.)
		props.features = {
			search: features.search?.fstate,
			filter: features.filter?.fstate,
			selection: features.selection?.fstate,
		};

		return props;
	}, [dataState, features]);
}
