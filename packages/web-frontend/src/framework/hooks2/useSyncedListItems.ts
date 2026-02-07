import { useEffect } from 'react';

import type { ListItemsContract } from './useListItems';
import { useListItems } from './useListItems';

/**
 * ===========================================================================================
 * USE SYNCED LIST ITEMS - Helper Hook with Auto-Sync to Parent State
 * ===========================================================================================
 *
 * Hook that combines useListItems with automatic syncing to parent state.
 * Useful for form fields that need to transform list items into a different
 * format before syncing to parent (e.g., array of objects to object with keys).
 *
 * Key features:
 * - Automatic transformation and sync on items change
 * - Optional filtering before transformation
 * - Supports all useListItems constraints (min/max items)
 * - Reduces boilerplate in integration code
 *
 * Example usage:
 * ```typescript
 * // Transform array of key-value items to object
 * const envItems = useSyncedListItems({
 *   initialItems: Object.entries(env).map(([key, value]) => ({ key, value })),
 *   transform: (items) => Object.fromEntries(
 *     items.filter(item => item.key.trim()).map(item => [item.key, item.value])
 *   ),
 *   onSync: (transformed) => onUpdateNode(id, { env: transformed }),
 *   minItems: 0,
 * });
 *
 * // Use in EditableListField
 * <EditableListField
 *   items={envItems}
 *   renderItem={(item, index, actions) => <KeyValueItemRenderer item={item} actions={actions} />}
 *   createDefault={() => ({ key: '', value: '' })}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface UseSyncedListItemsOptions<T, R = T[]> {
	/** Initial items to populate the list */
	initialItems?: T[];

	/** Transform function to convert items array to desired format */
	transform: (items: T[]) => R;

	/** Callback when transformed data should be synced to parent */
	onSync: (transformed: R) => void;

	/** Optional filter to exclude items from sync */
	filter?: (item: T) => boolean;

	/** Minimum number of items (default: 0) */
	minItems?: number;

	/** Maximum number of items (default: Infinity) */
	maxItems?: number;

	/** Factory function to create default items when adding */
	createDefault?: () => T;
}

/**
 * Hook that combines useListItems with automatic syncing to parent state.
 *
 * @param options - Configuration options
 * @returns ListItemsContract with fstate, actions, fillQuery
 */
export function useSyncedListItems<T, R = T[]>(options: UseSyncedListItemsOptions<T, R>): ListItemsContract<T> {
	const { initialItems, transform, onSync, filter, minItems, maxItems, createDefault } = options;

	// Create base list items hook
	const items = useListItems<T>({
		initialItems,
		minItems,
		maxItems,
		createDefault,
	});

	// Auto-sync transformed data to parent whenever items change
	useEffect(() => {
		const filtered = filter ? items.fstate.items.filter(filter) : items.fstate.items;
		const transformed = transform(filtered);
		onSync(transformed);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items.fstate.items]);

	return items;
}
