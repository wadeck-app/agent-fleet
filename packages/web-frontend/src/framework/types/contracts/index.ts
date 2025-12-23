/**
 * ===========================================================================================
 * FEATURE CONTRACTS - Barrel Export
 * ===========================================================================================
 *
 * Centralized export point for all feature contracts.
 * Import all contracts from a single location.
 *
 * Example usage:
 * ```typescript
 * import {
 *   PaginationContract,
 *   SortingContract,
 *   SearchContract,
 *   FilterContract
 * } from '@framework/types/contracts';
 * ```
 *
 * ===========================================================================================
 */

export type { PaginationState, PaginationActions, PaginationQuery, PaginationContract } from './PaginationContract';

export type {
	SortConfig,
	SortDirection,
	SortingState,
	SortingActions,
	SortingQuery,
	SortingContract,
} from './SortingContract';

export type { SearchState, SearchActions, SearchQuery, SearchContract } from './SearchContract';

export type { FilterState, FilterActions, FilterQuery, FilterContract } from './FilterContract';

export type {
	CacheControlState,
	CacheControlActions,
	CacheControlQuery,
	CacheControlContract,
} from './CacheControlContract';
