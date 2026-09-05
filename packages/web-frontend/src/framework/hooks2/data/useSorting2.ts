import { useCallback, useEffect, useMemo, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';
import type { FeatureContract } from '@framework/types/FeatureContract';
import type { SortConfig, SortDirection } from '@framework/types/contracts/SortingContract';

/**
 * ===========================================================================================
 * USE SORTING2 - Headless Composable Sorting Hook
 * ===========================================================================================
 *
 * Next-generation sorting hook following the headless composable pattern.
 * Supports multi-column sorting with shift+click.
 *
 * Key improvements over useSorting:
 * - Returns standardized FeatureContract: { state, fstate, actions, toQuery }
 * - toQuery() converts sortConfigs to comma-separated format for backend
 * - Consistent with all other feature hooks
 *
 * Example usage:
 * ```typescript
 * const sorting = useSorting2({
 *   storageId: 'ingredients2-table',
 *   defaultSort: [{ key: 'name', direction: 'asc' }],
 *   multiColumn: true
 * });
 *
 * // Access state
 * console.log(sorting.state.sortConfigs); // [{ key: 'name', direction: 'asc' }]
 * const sortInfo = sorting.state.getSortInfo('name'); // { direction: 'asc', priority: null }
 *
 * // Call actions (regular click - replace sort)
 * sorting.actions.handleSort('createdAt', false);
 *
 * // Call actions (shift+click - add to multi-sort)
 * sorting.actions.handleSort('updatedAt', true);
 *
 * // Get backend query
 * const query = sorting.toQuery();
 * // { sortBy: 'createdAt,updatedAt', sortOrder: 'desc,asc' }
 *
 * // Use in Data2 shell
 * <Data2 sorting={sorting} ...>
 *   <Table2 />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

export interface UseSorting2Options {
	/** Default sort configuration */
	defaultSort?: SortConfig[];
	/** Allow multi-column sorting (default: true) */
	multiColumn?: boolean;
	/** Unique identifier for persistent state (suffixed with '-sorting') */
	storageId?: string;
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

/**
 * State shape for sorting feature.
 * Exported for type-safe consumption in Data2 and other components.
 */
export interface SortingState {
	/** Current sort configurations (primary sort first) */
	sortConfigs: SortConfig[];
	/** Get sort info for a specific column (direction + priority in multi-sort) */
	getSortInfo: (key: string) => { direction: 'asc' | 'desc' | null; priority: number | null };
}

/**
 * Type alias for sorting feature contract.
 * Ensures type safety when passing sorting feature to Data2.
 */
export type SortingContract = FeatureContract<SortingState>;

/**
 * Headless sorting hook following the FeatureContract pattern.
 * Supports multi-column sorting (shift+click).
 *
 * Persistence Strategy:
 * - sortConfigs: Persisted to localStorage (user preference)
 *
 * Sort Cycle:
 * - Regular click: asc → desc → none (replaces all sorts)
 * - Shift+click: asc → desc → remove (adds to multi-sort)
 *
 * @param options - Configuration options
 * @returns SortingContract with state, fstate, actions, fillQuery
 */
export function useSorting2(options: UseSorting2Options = {}): SortingContract {
	const { defaultSort = [], multiColumn = true, storageId, storage = defaultStorage } = options;

	// Load initial sortConfigs from storage
	const loadFromStorage = useCallback((): SortConfig[] => {
		if (!storageId) {
			return defaultSort;
		}

		const storageKey = `${storageId}-sorting`;
		const stored = storage.get<SortConfig[]>(storageKey);

		if (stored && Array.isArray(stored)) {
			// Validate structure
			return stored.filter(
				(item): item is SortConfig =>
					typeof item === 'object' &&
					item !== null &&
					'key' in item &&
					'direction' in item &&
					typeof item.key === 'string' &&
					(item.direction === 'asc' || item.direction === 'desc')
			);
		}

		return defaultSort;
	}, [defaultSort, storageId, storage]);

	// Initialize state
	const [sortConfigs, setSortConfigs] = useState<SortConfig[]>(loadFromStorage);

	// Persist sortConfigs to storage whenever it changes
	useEffect(() => {
		if (!storageId) return;

		const storageKey = `${storageId}-sorting`;
		storage.set(storageKey, sortConfigs);
	}, [sortConfigs, storageId, storage]);

	// Get sort info for a specific column (direction + priority)
	const getSortInfo = useCallback(
		(key: string) => {
			const index = sortConfigs.findIndex(config => config.key === key);
			if (index < 0) {
				return { direction: null, priority: null };
			}
			const config = sortConfigs[index];
			if (!config) {
				return { direction: null, priority: null };
			}
			return {
				direction: config.direction,
				priority: sortConfigs.length > 1 ? index + 1 : null,
			};
		},
		[sortConfigs]
	);

	// State object (current UI state)
	const fstate = useMemo(
		() => ({
			sortConfigs,
			getSortInfo,
		}),
		[sortConfigs, getSortInfo]
	);

	// Frozen state (memoized, stable reference for useEffect deps)
	// This is already memoized via fstate

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			/**
			 * Handle sort change (click on column header)
			 * @param key - Column key to sort by
			 * @param shiftKey - If true, add to multi-sort; if false, replace sort
			 */
			handleSort: (key: string, shiftKey: boolean) => {
				setSortConfigs(prev => {
					const existingIndex = prev.findIndex(config => config.key === key);

					// Determine if multi-column mode is active
					const isMultiMode = multiColumn && shiftKey;

					if (!isMultiMode) {
						// Regular click: replace all sorts
						if (existingIndex >= 0) {
							const current = prev[existingIndex];
							if (!current) return prev;
							// Cycle: asc -> desc -> none
							if (current.direction === 'asc') {
								return [{ key, direction: 'desc' as SortDirection }];
							}
							return [];
						}
						return [{ key, direction: 'asc' as SortDirection }];
					} else {
						// Shift+click: multi-sort
						if (existingIndex >= 0) {
							const current = prev[existingIndex];
							if (!current) return prev;
							// Cycle: asc -> desc -> remove
							if (current.direction === 'asc') {
								const newConfigs = [...prev];
								newConfigs[existingIndex] = { key, direction: 'desc' as SortDirection };
								return newConfigs;
							}
							return prev.filter((_, index) => index !== existingIndex);
						}
						return [...prev, { key, direction: 'asc' as SortDirection }];
					}
				});
			},

			/** Clear all sorting */
			clearSort: () => {
				setSortConfigs([]);
			},

			/** Set sort configurations directly (useful for programmatic updates) */
			setSortConfigs: (configs: SortConfig[]) => {
				setSortConfigs(configs);
			},
		}),
		[multiColumn]
	);

	// Fill backend query parameters
	// Format: { sortBy: 'name,createdAt', sortOrder: 'asc,desc' }
	const fillQuery = useCallback(
		(query: Record<string, unknown>) => {
			if (sortConfigs.length === 0) {
				return; // No sorting - don't fill query
			}

			query.sortBy = sortConfigs.map(c => c.key).join(',');
			query.sortOrder = sortConfigs.map(c => c.direction).join(',');
		},
		[sortConfigs]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
