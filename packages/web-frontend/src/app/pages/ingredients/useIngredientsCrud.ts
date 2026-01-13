import { useCallback, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateIngredient, Ingredient, UpdateIngredient } from '@shared/api/ingredients.contract';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';

import { ingredientsService } from './IngredientsService';

/**
 * ===========================================================================================
 * USE INGREDIENTS CRUD HOOK - CRUD Operations Only (No Data Fetching)
 * ===========================================================================================
 *
 * Responsibilities:
 * - Provide CRUD operations (create, update, delete, refresh)
 * - Track operation-specific states (isSubmitting, operationError)
 * - NO automatic data fetching (Data2 handles that)
 *
 * Benefits:
 * - Clean separation: Data2 handles fetching, this hook handles mutations
 * - Avoids double fetching when used with Data2
 * - Reusable across different pages (table, grid, etc.)
 * - Operations can trigger Data2 refresh via cache control
 *
 * Usage:
 * ```tsx
 * const { createIngredient, updateIngredient, deleteIngredient } = useIngredientsCrud();
 *
 * // After mutation, refresh Data2 via cache control
 * await createIngredient(data);
 * cache.actions.refresh(); // Triggers Data2 refetch
 * ```
 *
 * ===========================================================================================
 */

export interface UseIngredientsCrudResult {
	// Operations
	createIngredient: (data: CreateIngredient) => Promise<void>;
	updateIngredient: (id: string, data: UpdateIngredient) => Promise<void>;
	deleteIngredient: (id: string) => Promise<void>;
	bulkDeleteIngredients: (ids: string[]) => Promise<BulkDeleteResponse>;
	refreshIngredient: (id: string) => Promise<Ingredient | null>;

	// Operation states
	isSubmitting: boolean;
	operationError: string | null;
	clearOperationError: () => void;
}

export function useIngredientsCrud(): UseIngredientsCrudResult {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [operationError, setOperationError] = useState<string | null>(null);

	/**
	 * Create a new ingredient
	 */
	const createIngredient = async (data: CreateIngredient) => {
		try {
			setIsSubmitting(true);
			setOperationError(null);
			await ingredientsService.createIngredient(data);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to create ingredient';
			setOperationError(message);
			console.error('Error creating ingredient:', err);
			throw err;
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Update an existing ingredient
	 */
	const updateIngredient = async (id: string, data: CreateIngredient & { version: number }) => {
		try {
			setIsSubmitting(true);
			setOperationError(null);
			await ingredientsService.updateIngredient(id, data);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to update ingredient';
			setOperationError(message);
			console.error('Error updating ingredient:', err);
			throw err;
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Delete an ingredient
	 */
	const deleteIngredient = async (id: string) => {
		try {
			setOperationError(null);
			await ingredientsService.deleteIngredient(id);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to delete ingredient';
			setOperationError(message);
			console.error('Error deleting ingredient:', err);
			throw err;
		}
	};

	/**
	 * Bulk delete ingredients
	 */
	const bulkDeleteIngredients = useCallback(async (ids: string[]) => {
		const result = await ingredientsService.bulkDeleteIngredients(ids);
		// Caller should trigger Data2 refresh via cache.actions.refresh()
		return result;
	}, []);

	/**
	 * Refresh a single ingredient from the API to get latest version
	 * This is useful for refreshing a dialog without refetching the entire list
	 */
	const refreshIngredient = async (id: string): Promise<Ingredient | null> => {
		try {
			const ingredient = await ingredientsService.getIngredient(id);
			return ingredient;
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to refresh ingredient';
			setOperationError(message);
			console.error('Error refreshing ingredient:', err);
			return null;
		}
	};

	/**
	 * Clear the current operation error
	 */
	const clearOperationError = () => {
		setOperationError(null);
	};

	return {
		// Operations
		createIngredient,
		updateIngredient,
		deleteIngredient,
		bulkDeleteIngredients,
		refreshIngredient,

		// Operation states
		isSubmitting,
		operationError,
		clearOperationError,
	};
}
