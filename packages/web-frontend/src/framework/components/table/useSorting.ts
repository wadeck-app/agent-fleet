import { useCallback, useEffect, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';

/**
 * ===========================================================================================
 * USE SORTING - Composable Hook
 * ===========================================================================================
 *
 * Generic sorting state management hook.
 * Can be used with tables, lists, grids, or any sortable UI.
 *
 * Features:
 * - Multi-column sorting support
 * - Configurable sort directions (asc, desc)
 * - Single or multi-column mode
 * - Shift+click for multi-column sorting
 * - Backend or frontend sorting support
 *
 * Example usage:
 * ```typescript
 * // Table with multi-column sorting
 * const sorting = useSorting();
 *
 * // List with single-column sorting
 * const sorting = useSorting({ multiColumn: false });
 *
 * // With default sort
 * const sorting = useSorting({
 *   defaultSort: [{ key: 'name', direction: 'asc' }]
 * });
 * ```
 *
 * ===========================================================================================
 */

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
	key: string;
	direction: SortDirection;
}

export interface UseSortingOptions {
	/** Default sort configuration */
	defaultSort?: SortConfig[];
	/** Allow multi-column sorting (default: true) */
	multiColumn?: boolean;
	/** Unique identifier for persistent state (suffixed with '-sorting') */
	storageId?: string;
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

export interface UseSortingResult {
	/** Current sort configurations */
	sortConfigs: SortConfig[];
	/** Handle sort change (supports shift+click for multi-column) */
	handleSort: (key: string, shiftKey: boolean) => void;
	/** Clear all sorting */
	clearSort: () => void;
	/** Set sort configurations directly */
	setSortConfigs: (configs: SortConfig[]) => void;
	/** Get sort info for a specific column */
	getSortInfo: (key: string) => { direction: SortDirection | null; priority: number | null };
}

export function useSorting(options: UseSortingOptions = {}): UseSortingResult {
	const { defaultSort = [], multiColumn = true, storageId, storage = defaultStorage } = options;

	// Load initial state from storage (SSR-safe)
	const loadFromStorage = (): SortConfig[] => {
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
	};

	const [sortConfigs, setSortConfigs] = useState<SortConfig[]>(loadFromStorage);

	// Save to storage whenever sortConfigs changes
	useEffect(() => {
		if (!storageId) {
			return;
		}

		const storageKey = `${storageId}-sorting`;
		storage.set(storageKey, sortConfigs);
	}, [sortConfigs, storageId, storage]);

	const handleSort = useCallback(
		(key: string, shiftKey: boolean) => {
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
							return [{ key, direction: 'desc' }];
						}
						return [];
					}
					return [{ key, direction: 'asc' }];
				} else {
					// Shift+click: multi-sort
					if (existingIndex >= 0) {
						const current = prev[existingIndex];
						if (!current) return prev;
						// Cycle: asc -> desc -> remove
						if (current.direction === 'asc') {
							const newConfigs = [...prev];
							newConfigs[existingIndex] = { key, direction: 'desc' };
							return newConfigs;
						}
						return prev.filter((_, index) => index !== existingIndex);
					}
					return [...prev, { key, direction: 'asc' }];
				}
			});
		},
		[multiColumn]
	);

	const clearSort = useCallback(() => {
		setSortConfigs([]);
	}, []);

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

	return {
		sortConfigs,
		handleSort,
		clearSort,
		setSortConfigs,
		getSortInfo,
	};
}
