import { useMemo, useState } from 'react';

import type { FeatureFormContract } from '@framework/types/contracts/FeatureFormContract';

/**
 * ===========================================================================================
 * USE LIST ITEMS - Headless Composable List CRUD Hook
 * ===========================================================================================
 *
 * Generic hook for managing a list of items with CRUD operations.
 * Follows the FeatureFormContract pattern (form-specific, no backend queries).
 *
 * Key features:
 * - Type-safe CRUD operations (add, remove, update, set, clear)
 * - Min/max constraints with derived canAdd/canRemove flags
 * - Frozen state (fstate) for stable useEffect dependencies
 * - Grouped actions for clean API
 * - Local state only (no fillQuery, does not contribute to backend queries)
 *
 * Example usage:
 * ```typescript
 * const items = useListItems<KeyValueItem>({
 *   initialItems: [{ key: 'foo', value: 'bar' }],
 *   minItems: 0,
 *   maxItems: 10,
 *   createDefault: () => ({ key: '', value: '' }),
 * });
 *
 * // Access state
 * console.log(items.fstate.items); // [{ key: 'foo', value: 'bar' }]
 * console.log(items.fstate.canAdd); // true
 *
 * // Call actions
 * items.actions.add({ key: 'baz', value: 'qux' });
 * items.actions.update(0, { value: 'updated' });
 * items.actions.remove(1);
 * ```
 *
 * ===========================================================================================
 */

export interface UseListItemsOptions<T> {
	/** Initial items to populate the list */
	initialItems?: T[];
	/** Minimum number of items (default: 0) */
	minItems?: number;
	/** Maximum number of items (default: Infinity) */
	maxItems?: number;
	/** Factory function to create default items when adding */
	createDefault?: () => T;
}

/**
 * State shape for list items feature.
 * Exported for type-safe consumption in EditableListField.
 */
export interface ListItemsState<T> {
	/** Current list of items */
	items: T[];
	/** Number of items in the list */
	count: number;
	/** Whether the list is empty */
	isEmpty: boolean;
	/** Whether a new item can be added (respects maxItems) */
	canAdd: boolean;
	/** Whether an item can be removed (respects minItems) */
	canRemove: boolean;
}

/**
 * Type alias for list items feature contract.
 * Ensures type safety when passing to EditableListField.
 */
export type ListItemsContract<T> = FeatureFormContract<ListItemsState<T>>;

/**
 * Headless list items hook following the FeatureFormContract pattern.
 *
 * @param options - Configuration options
 * @returns ListItemsContract with fstate and actions
 */
export function useListItems<T>(options: UseListItemsOptions<T> = {}): ListItemsContract<T> {
	const { initialItems = [], minItems = 0, maxItems = Infinity } = options;

	// Internal state
	const [items, setItems] = useState<T[]>(initialItems);

	// Derived state
	const count = items.length;
	const isEmpty = count === 0;
	const canAdd = count < maxItems;
	const canRemove = count > minItems;

	// Frozen state (memoized, stable reference for useEffect deps)
	const fstate = useMemo(
		() => ({
			items,
			count,
			isEmpty,
			canAdd,
			canRemove,
		}),
		[items, count, isEmpty, canAdd, canRemove]
	);

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			/**
			 * Add a new item to the end of the list
			 */
			add: (item: T) => {
				if (!canAdd) {
					return;
				}
				setItems(prev => [...prev, item]);
			},

			/**
			 * Remove an item by index
			 */
			remove: (index: number) => {
				if (!canRemove) {
					return;
				}
				if (index < 0 || index >= count) {
					return;
				}
				setItems(prev => prev.filter((_, i) => i !== index));
			},

			/**
			 * Update an item by index with partial data
			 */
			update: (index: number, partial: Partial<T>) => {
				if (index < 0 || index >= count) {
					return;
				}
				setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...partial } : item)));
			},

			/**
			 * Replace the entire list with new items
			 */
			set: (newItems: T[]) => {
				setItems(newItems);
			},

			/**
			 * Clear all items (respects minItems constraint)
			 */
			clear: () => {
				if (minItems === 0) {
					setItems([]);
				}
			},

			/**
			 * Reorder items by moving from one index to another
			 */
			reorder: (fromIndex: number, toIndex: number) => {
				if (fromIndex < 0 || fromIndex >= count) {
					return;
				}
				if (toIndex < 0 || toIndex >= count) {
					return;
				}
				if (fromIndex === toIndex) {
					return;
				}

				setItems(prev => {
					const result = [...prev];
					const [removed] = result.splice(fromIndex, 1);
					result.splice(toIndex, 0, removed);
					return result;
				});
			},
		}),
		[canAdd, canRemove, count, minItems]
	);

	return {
		fstate,
		actions,
	};
}
