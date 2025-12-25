/**
 * ===========================================================================================
 * FEATURE CONTRACT - Base Interface for Headless Composable Features
 * ===========================================================================================
 *
 * This is the foundational contract that ALL feature hooks must implement.
 * It ensures consistent, composable, and predictable behavior across all features
 * (pagination, sorting, search, filters, etc.).
 *
 * Core Principles:
 * - **fstate**: Frozen state (memoized reference) - the single source of truth
 * - **actions**: All state-modifying functions
 * - **fillQuery**: Converts feature state → backend query parameters
 *
 * Why only fstate?
 * Object dependencies in useEffect cause infinite loops if not stable references.
 * fstate is memoized and ONLY changes when actual state values change.
 * Data2 uses fstate in dependency arrays to avoid infinite refetches.
 * This is the source of truth for the feature state.
 *
 * Example usage:
 * ```typescript
 * function usePagination2(options): PaginationContract {
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
import { type BaseListQueryMutable } from '@shared/common/api-helpers';

export type QueryFiller = (query: BaseListQueryMutable) => void;

/**
 * Base contract that ALL feature hooks must implement.
 * Ensures composability and predictable behavior across the entire headless architecture.
 *
 * @template TState - The shape of the feature's UI state
 */
export interface FeatureContract<TState> {
	/**
	 * Frozen state reference (memoized, stable).
	 * This is the single source of truth for the feature's current state.
	 *
	 * CRITICAL: fstate MUST be memoized (useMemo) and ONLY change when actual state values change.
	 * This is what Data2 uses for dependency arrays to prevent unnecessary refetches.
	 * Use fstate everywhere: rendering, useEffect deps, and state access.
	 *
	 * Example:
	 * ```typescript
	 * const fstate = useMemo(() => ({ currentPage, pageSize }), [currentPage, pageSize]);
	 * ```
	 */
	fstate: TState;

	/**
	 * Actions to modify state.
	 * All state-changing functions should be grouped here.
	 *
	 * IMPORTANT: Actions should be memoized (useCallback or useMemo) for stable refs.
	 *
	 * Example:
	 * ```typescript
	 * const actions = useMemo(() => ({
	 *   setPage: (page: number) => setCurrentPage(page),
	 *   setPageSize: (size: number) => setPageSize(size),
	 * }), []);
	 * ```
	 */
	actions: Record<string, (...args: any[]) => void>;

	/**
	 * Fill the backend query schema with this feature's state.
	 * This is how features contribute to the composed query sent to the backend.
	 *
	 * Features are processed in order. If multiple features fill the same property,
	 * the last one wins (FIFO override).
	 *
	 * Empty values (undefined, null, '') are filtered out after all features
	 * have filled the query.
	 *
	 * @param query - The query object to fill (type-safe mutation using BaseListQueryMutable)
	 *
	 * Example:
	 * ```typescript
	 * const fillQuery = useCallback((query) => {
	 *   query.page = currentPage;
	 *   query.pageSize = pageSize;
	 * }, [currentPage, pageSize]);
	 * ```
	 */
	fillQuery: QueryFiller;
}

/**
 * Type helper for extracting state type from a FeatureContract
 */
export type FeatureState<T> = T extends FeatureContract<infer S> ? S : never;
