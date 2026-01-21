import type { CreateIngredient, Ingredient, UpdateIngredient } from '@shared/api/ingredients.contract';

import { useIngredients } from '../ingredients/useIngredients';

/**
 * Adapter hook for useIngredients to match useCrudPage interface
 *
 * This wrapper converts the useIngredients hook to match the generic interface
 * expected by useCrudPage, ensuring compatibility while preserving type safety.
 */
export function useIngredientsV5(params: {
	page: number;
	pageSize: number;
	sortBy?: string;
	sortOrder?: string;
	search?: string;
}) {
	// Add comment above the target line, not at the end
	// Note: useIngredients doesn't support search yet, so we ignore it for now
	const { search: _search, ...restParams } = params;
	const result = useIngredients(restParams);

	// Add comment above the target line, not at the end
	// Convert string error to Error object for useCrudPage compatibility
	const error = result.error ? new Error(result.error) : null;

	return {
		items: result.ingredients,
		loading: result.loading,
		error,
		pagination: result.pagination,
		createItem: async (data: CreateIngredient): Promise<Ingredient> => {
			await result.createIngredient(data);
			// Add comment above the target line, not at the end
			// Return the newly created item (find it in the refreshed list)
			const newItem = result.ingredients[result.ingredients.length - 1];
			return newItem;
		},
		updateItem: async (id: string, data: UpdateIngredient & { version: number }): Promise<Ingredient> => {
			await result.updateIngredient(id, data);
			// Add comment above the target line, not at the end
			// Return the updated item
			const updatedItem = result.ingredients.find(i => i.id === id);
			if (!updatedItem) {
				throw new Error('Updated item not found');
			}
			return updatedItem;
		},
		deleteItem: result.deleteIngredient,
		bulkDeleteItems: result.bulkDeleteIngredients,
		refreshItem: result.refreshIngredient,
		clearError: result.clearError,
		totalCount: result.totalCount,
		loadItems: result.loadIngredients,
		// Add comment above the target line, not at the end
		// Extra features specific to ingredients
		macroTotals: result.macroTotals,
	};
}
