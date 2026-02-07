import { useCallback } from 'react';

import type { MutationContract, MutationMethods } from '@framework/types/MutationContract';

/**
 * ===========================================================================================
 * USE MUTATION - Cache Mutation Hook
 * ===========================================================================================
 *
 * Provides cache mutation methods when mutation contract is provided.
 * Separated from useDataFetch for better separation of concerns.
 *
 * Features:
 * - updateItem: Update existing item in cache (for PATCH/PUT)
 * - addItem: Triggers refresh (for POST - changes total/pagination)
 * - removeItem: Triggers refresh (for DELETE - changes total/pagination)
 *
 * Why refresh for add/remove?
 * - Adding an item increases the total count
 * - Removing an item decreases the total count
 * - Both operations can break pagination (exceed pageSize, change totalPages)
 * - Safer to refetch from server to get correct total and pagination metadata
 *
 * Example usage:
 * ```typescript
 * const mutation = useMutation(setData, mutationContract, refreshFn);
 *
 * // Update item (direct cache mutation)
 * mutation.updateItem(updatedItem);
 *
 * // Add/Remove item (triggers refresh)
 * mutation.addItem(newItem); // Calls refresh()
 * mutation.removeItem(itemId); // Calls refresh()
 * ```
 *
 * ===========================================================================================
 */

/**
 * Hook for cache mutations
 *
 * @param setData - State setter for data array
 * @param mutation - Optional mutation contract
 * @param refresh - Optional refresh function (for add/remove operations)
 * @returns Mutation methods (updateItem, addItem, removeItem) or undefined
 */
export function useMutation<T>(
	setData: React.Dispatch<React.SetStateAction<T[]>>,
	mutation: MutationContract<T> | undefined,
	refresh?: () => void
): MutationMethods<T> | undefined {
	// Update existing item in cache (for PATCH/PUT)
	const updateItem = useCallback(
		(updatedItem: T) => {
			if (!mutation) return;

			setData(prev =>
				prev.map(item =>
					mutation.keyExtractor(item) === mutation.keyExtractor(updatedItem) ? updatedItem : item
				)
			);

			// Optional callback
			mutation.onUpdate?.(updatedItem);
		},
		[mutation, setData]
	);

	// Add item triggers refresh (for POST - changes total/pagination)
	const addItem = useCallback(
		(_newItem: T) => {
			if (!mutation) return;

			// Don't mutate cache directly - refresh to get correct total/pagination
			console.log('[useMutation] addItem called - triggering refresh to update total/pagination');
			refresh?.();

			// Optional callback (before refresh)
			mutation.onAdd?.(_newItem);
		},
		[mutation, refresh]
	);

	// Remove item triggers refresh (for DELETE - changes total/pagination)
	const removeItem = useCallback(
		(itemId: string | number) => {
			if (!mutation) return;

			// Don't mutate cache directly - refresh to get correct total/pagination
			console.log('[useMutation] removeItem called - triggering refresh to update total/pagination');
			refresh?.();

			// Optional callback (before refresh)
			mutation.onRemove?.(itemId);
		},
		[mutation, refresh]
	);

	// Return mutation methods if contract provided
	if (!mutation) return undefined;

	return {
		updateItem,
		addItem,
		removeItem,
	};
}
