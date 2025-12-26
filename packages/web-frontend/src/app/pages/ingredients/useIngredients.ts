import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type {
	BulkDeleteResponse,
	CreateIngredient,
	Ingredient,
	UpdateIngredient,
} from '@shared/api/ingredients.contract';

import { ingredientsService } from './IngredientsService';

/**
 * ===========================================================================================
 * USE INGREDIENTS HOOK - State Management & API Interface
 * ===========================================================================================
 *
 * Responsibilities:
 * - Manage loading, error, and data states
 * - Expose CRUD operations to components
 * - Handle side effects (loading data on mount)
 * - Provide clean interface for components
 *
 * Benefits:
 * - Components stay pure and focused on presentation
 * - Business logic is testable independently
 * - State management is centralized
 * - Easy to mock for component testing
 *
 * ===========================================================================================
 */

export interface UseIngredientsParams {
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: string;
}

export interface UseIngredientsResult {
	// Data state
	ingredients: Ingredient[];
	loading: boolean;
	error: string | null;
	pagination: {
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
	} | null;

	// Operations
	loadIngredients: (params?: UseIngredientsParams) => Promise<void>;
	createIngredient: (data: CreateIngredient) => Promise<void>;
	updateIngredient: (id: string, data: UpdateIngredient) => Promise<void>;
	deleteIngredient: (id: string) => Promise<void>;
	bulkDeleteIngredients: (ids: string[]) => Promise<BulkDeleteResponse>;
	refreshIngredient: (id: string) => Promise<Ingredient | null>;
	clearError: () => void;

	// Computed values
	totalCount: number;
	macroTotals: {
		totalCalories: number;
		totalProtein: number;
		totalCarbs: number;
		totalFat: number;
	};
}

export function useIngredients(params?: UseIngredientsParams): UseIngredientsResult {
	const [ingredients, setIngredients] = useState<Ingredient[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pagination, setPagination] = useState<{
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
	} | null>(null);

	/**
	 * Load ingredients from the API with pagination/sorting support
	 *
	 * Note: useCallback is necessary here because this function is used in useEffect dependencies.
	 * Without it, we get an infinite loop: useEffect runs → state updates → component re-renders
	 * → new loadIngredients function created → useEffect sees dependency changed → runs again → loop.
	 *
	 * React Compiler does NOT stabilize functions used in useEffect dependencies.
	 */
	const loadIngredients = useCallback(async (newParams?: UseIngredientsParams) => {
		try {
			setLoading(true);
			setError(null);
			const data = await ingredientsService.getIngredients(newParams);
			setIngredients(data.items);
			setPagination(data.pagination ?? null);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load ingredients';
			setError(message);
			console.error('Error loading ingredients:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	/**
	 * Create a new ingredient
	 */
	const createIngredient = async (data: CreateIngredient) => {
		try {
			setError(null);
			await ingredientsService.createIngredient(data);
			// Reload to get fresh data from server
			await loadIngredients();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to create ingredient';
			setError(message);
			console.error('Error creating ingredient:', err);
			throw err;
		}
	};

	/**
	 * Update an existing ingredient
	 */
	const updateIngredient = async (id: string, data: CreateIngredient & { version: number }) => {
		try {
			setError(null);
			await ingredientsService.updateIngredient(id, data);
			// Reload to get fresh data from server
			await loadIngredients();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to update ingredient';
			setError(message);
			console.error('Error updating ingredient:', err);
			throw err;
		}
	};

	/**
	 * Delete an ingredient
	 */
	const deleteIngredient = async (id: string) => {
		try {
			setError(null);
			await ingredientsService.deleteIngredient(id);
			// Reload to get fresh data from server
			await loadIngredients();
		} catch (err: unknown) {
			// Use getErrorMessage to extract user-friendly error message
			const message = getErrorMessage(err) || 'Failed to delete ingredient';
			setError(message);
			console.error('Error deleting ingredient:', err);
			throw err;
		}
	};

	/**
	 * Bulk delete ingredients
	 */
	const bulkDeleteIngredients = useCallback(async (ids: string[]) => {
		const result = await ingredientsService.bulkDeleteIngredients(ids);
		return result;
	}, []);

	/**
	 * Refresh a single ingredient from the API to get latest version
	 */
	const refreshIngredient = async (id: string): Promise<Ingredient | null> => {
		try {
			const ingredient = await ingredientsService.getIngredient(id);
			// Update the ingredient in the list
			setIngredients(prev => prev.map(i => (i.id === id ? ingredient : i)));
			return ingredient;
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to refresh ingredient';
			setError(message);
			console.error('Error refreshing ingredient:', err);
			return null;
		}
	};

	/**
	 * Clear the current error
	 */
	const clearError = () => {
		setError(null);
	};

	/**
	 * Load ingredients when params change
	 * Uses useAbortableEffect to cancel stale requests and prevent race conditions
	 */
	useAbortableEffect(
		async signal => {
			try {
				setLoading(true);
				setError(null);
				const data = await ingredientsService.getIngredients(params);

				// Only update state if request wasn't aborted
				if (!signal.aborted) {
					setIngredients(data.items);
					setPagination(data.pagination ?? null);
				}
			} catch (err) {
				// Ignore aborted requests
				if (!signal.aborted) {
					const message = err instanceof Error ? err.message : 'Failed to load ingredients';
					setError(message);
					console.error('Error loading ingredients:', err);
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[params?.page, params?.pageSize, params?.sortBy, params?.sortOrder]
	);

	/**
	 * Calculate macro totals using the service
	 */
	const macroTotals = ingredientsService.calculateTotalMacros(ingredients);

	/**
	 * Total count from backend or fallback to array length
	 */
	const totalCount = pagination?.total ?? ingredients.length;

	return {
		// Data state
		ingredients,
		loading,
		error,
		pagination,

		// Operations
		loadIngredients,
		createIngredient,
		updateIngredient,
		deleteIngredient,
		bulkDeleteIngredients,
		refreshIngredient,
		clearError,

		// Computed values
		totalCount,
		macroTotals,
	};
}
