import { useCallback, useEffect, useMemo, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';
import type { FeatureContract } from '@framework/types/FeatureContract';

/**
 * ===========================================================================================
 * USE CATEGORY FILTER2 - Headless Composable Category Filter Hook
 * ===========================================================================================
 *
 * Domain-specific filter hook for category selection.
 * Follows the headless composable pattern with localStorage persistence.
 *
 * Example usage:
 * ```typescript
 * const categoryFilter = useCategoryFilter2({
 *   categories: ['Protein', 'Vegetable', 'Fruit', 'Grain'],
 *   storageId: 'ingredients2',
 *   defaultCategory: null
 * });
 *
 * // Access state
 * console.log(categoryFilter.state.value); // 'Protein' or null
 * console.log(categoryFilter.state.options); // ['Protein', 'Vegetable', ...]
 *
 * // Call actions
 * categoryFilter.actions.setValue('Protein');
 * categoryFilter.actions.clearValue();
 *
 * // Get backend query (only if value set)
 * const query = categoryFilter.toQuery();
 * // { category: 'Protein' } or {} if null
 *
 * // Use in UI
 * <Select
 *   value={categoryFilter.state.value || ''}
 *   onChange={(e) => categoryFilter.actions.setValue(e.target.value || null)}
 * >
 *   <option value="">All Categories</option>
 *   {categoryFilter.state.options.map(cat => (
 *     <option key={cat} value={cat}>{cat}</option>
 *   ))}
 * </Select>
 *
 * // Use in Data2 shell
 * <Data2 filter={categoryFilter} ...>
 *   <Table2 />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

export interface UseCategoryFilter2Options {
	/** Available category options */
	categories: string[];
	/** Unique identifier for persistent state (suffixed with '-category-filter') */
	storageId?: string;
	/** Default category value (null = no filter) */
	defaultCategory?: string | null;
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

/**
 * State shape for category filter feature.
 * Exported for type-safe consumption in Data2 and other components.
 */
export interface FilterState {
	/** Currently selected category (null = no filter) */
	value: string | null;
	/** Available category options */
	options: string[];
}

/**
 * Type alias for filter feature contract.
 * Ensures type safety when passing filter feature to Data2.
 */
export type FilterContract = FeatureContract<FilterState>;

/**
 * Headless category filter hook following the FeatureContract pattern.
 * Domain-specific for ingredient categories but follows generic FilterContract.
 *
 * Persistence Strategy:
 * - value: Persisted to localStorage (user preference)
 *
 * @param options - Configuration options
 * @returns FilterContract with state, fstate, actions, fillQuery
 */
export function useCategoryFilter2(options: UseCategoryFilter2Options): FilterContract {
	const { categories, storageId, defaultCategory = null, storage = defaultStorage } = options;

	// Storage key for filter state
	const storageKey = storageId ? `${storageId}-category-filter` : null;

	// Load initial value from storage
	const loadFromStorage = useCallback((): string | null => {
		if (!storageKey) return defaultCategory;

		const stored = storage.get<string>(storageKey);

		// Validate that stored value is in available categories
		if (stored && categories.includes(stored)) {
			return stored;
		}

		return defaultCategory;
	}, [storageKey, defaultCategory, categories, storage]);

	// Initialize state
	const [value, setValue] = useState<string | null>(loadFromStorage);

	// Persist value to storage whenever it changes
	useEffect(() => {
		if (!storageKey) return;

		if (value) {
			storage.set(storageKey, value);
		} else {
			storage.remove(storageKey);
		}
	}, [value, storageKey, storage]);

	// State object (current UI state)
	const fstate = useMemo(
		() => ({
			value,
			options: categories,
		}),
		[value, categories]
	);

	// Frozen state (memoized, stable reference for useEffect deps)
	// This is already memoized via fstate

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			/** Set filter value (null to clear filter) */
			setValue: (newValue: string | null) => {
				// Validate that value is in available categories
				if (newValue && !categories.includes(newValue)) {
					console.warn(`Invalid category value: ${newValue}. Must be one of: ${categories.join(', ')}`);
					return;
				}
				setValue(newValue);
			},

			/** Clear filter value */
			clearValue: () => {
				setValue(null);
			},
		}),
		[categories]
	);

	// Fill backend query parameters
	// Only fills 'category' param when value is set
	const fillQuery = useCallback(
		(query: Record<string, unknown>) => {
			if (!value) {
				return; // No filter - don't fill query
			}

			query.category = value;
		},
		[value]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
