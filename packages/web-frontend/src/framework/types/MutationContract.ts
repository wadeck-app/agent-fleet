/**
 * ===========================================================================================
 * MUTATION CONTRACT
 * ===========================================================================================
 *
 * Optional feature contract for Data2 that enables direct cache mutations.
 *
 * Purpose:
 * - Update/add/remove individual items without full refetch
 * - Use backend response directly (optimistic update)
 * - Avoid waiting for WebSocket events or polling
 *
 * Usage:
 * ```typescript
 * const mutation: MutationContract<Worker> = {
 *   keyExtractor: (w) => w.workerId,
 * };
 *
 * <Data2 mutation={mutation} ...>
 *   {(props) => (
 *     <Table
 *       onUpdate={async (item) => {
 *         const updated = await api.update(item);
 *         props.mutation?.updateItem(updated); // Direct cache update
 *       }}
 *     />
 *   )}
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

/**
 * Mutation contract for Data2
 * Enables direct cache mutations without full refetch
 */
export interface MutationContract<T> {
	/**
	 * Extract unique key from item (for identifying which item to update/remove)
	 * @example (worker) => worker.workerId
	 * @example (book) => book.id
	 */
	keyExtractor: (item: T) => string | number;

	/**
	 * Optional callback when item is updated
	 * @param updatedItem The item after update
	 */
	onUpdate?: (updatedItem: T) => void;

	/**
	 * Optional callback when item is added
	 * @param newItem The newly added item
	 */
	onAdd?: (newItem: T) => void;

	/**
	 * Optional callback when item is removed
	 * @param itemId The ID of the removed item
	 */
	onRemove?: (itemId: string | number) => void;
}

/**
 * Mutation methods exposed by Data2
 * Available when mutation contract is provided
 */
export interface MutationMethods<T> {
	/**
	 * Update an existing item in the cache
	 * Finds item by keyExtractor and replaces it
	 * @param updatedItem The item with updated fields
	 */
	updateItem: (updatedItem: T) => void;

	/**
	 * Add a new item to the cache
	 * Appends to end of list
	 * @param newItem The item to add
	 */
	addItem: (newItem: T) => void;

	/**
	 * Remove an item from the cache
	 * Finds item by ID and removes it
	 * @param itemId The ID of the item to remove
	 */
	removeItem: (itemId: string | number) => void;
}
