/**
 * ===========================================================================================
 * FEATURE DATA CONTRACT
 * ===========================================================================================
 *
 * Contract for data-fetching feature hooks (queryable features).
 * These hooks manage state that DOES contribute to backend queries.
 *
 * This is an alias to FeatureContract but provides semantic clarity:
 * - FeatureDataContract: Used by data hooks (pagination, sorting, search, filters)
 * - FeatureFormContract: Used by form hooks (list items, validation)
 *
 * Key differences:
 * - Includes fillQuery for backend query composition
 * - Used by hooks that fetch/filter data from backend
 * - Examples: usePagination2, useSorting2, useSimpleSearch
 *
 * Example usage:
 * ```typescript
 * function usePagination2(options): FeatureDataContract<PaginationState> {
 *   const [page, setPage] = useState(1);
 *   const [pageSize, setPageSize] = useState(10);
 *
 *   const fstate = useMemo(() => ({ page, pageSize }), [page, pageSize]);
 *   const actions = useMemo(() => ({ setPage, setPageSize }), []);
 *   const fillQuery = useCallback((query) => {
 *     query.page = page;
 *     query.pageSize = pageSize;
 *   }, [page, pageSize]);
 *
 *   return { fstate, actions, fillQuery };
 * }
 * ```
 *
 * ===========================================================================================
 */
import type { FeatureContract } from '../FeatureContract';

/**
 * Contract for data-fetching feature hooks.
 * These hooks manage state that DOES contribute to backend queries.
 *
 * This is an alias to FeatureContract for semantic clarity:
 * - Use FeatureDataContract for data hooks (pagination, sorting, search)
 * - Use FeatureFormContract for form hooks (list items, validation)
 *
 * @template TState - The shape of the feature's UI state
 */
export type FeatureDataContract<TState> = FeatureContract<TState>;

/**
 * Type helper for extracting state type from a FeatureDataContract
 */
export type FeatureDataState<T> = T extends FeatureDataContract<infer S> ? S : never;
