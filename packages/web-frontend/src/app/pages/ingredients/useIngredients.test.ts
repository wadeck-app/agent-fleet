import { withMetadata } from '@framework/tests/withMetadata';
import type { CreateIngredient, Ingredient } from '@shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ingredientsService } from './IngredientsService';
import { useIngredients } from './useIngredients';

// Mock the service layer
vi.mock('./IngredientsService', () => ({
	ingredientsService: {
		getIngredients: vi.fn(),
		createIngredient: vi.fn(),
		updateIngredient: vi.fn(),
		deleteIngredient: vi.fn(),
		calculateTotalMacros: vi.fn(),
	},
}));

describe('useIngredients', () => {
	const mockIngredients: Ingredient[] = [
		withMetadata({
			id: '1',
			name: 'Chicken Breast',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			servingSize: 100,
			version: 1,
			unit: 'g',
			category: 'Protein',
		}),
		withMetadata({
			id: '2',
			name: 'Brown Rice',
			calories: 123,
			protein: 2.6,
			carbs: 25.6,
			fat: 0.9,
			servingSize: 100,
			version: 1,
			unit: 'g',
			category: 'Grains',
		}),
	];

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default mock behavior
		vi.mocked(ingredientsService.calculateTotalMacros).mockReturnValue({
			totalCalories: 288,
			totalProtein: 33.6,
			totalCarbs: 25.6,
			totalFat: 4.5,
		});
	});

	describe('initial load', () => {
		it('should load ingredients on mount', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const { result } = renderHook(() => useIngredients());

			// Initially loading
			expect(result.current.loading).toBe(true);
			expect(result.current.ingredients).toEqual([]);

			// Wait for data to load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.ingredients).toEqual(mockIngredients);
			expect(result.current.error).toBeNull();
			expect(ingredientsService.getIngredients).toHaveBeenCalledOnce();
		});

		it('should handle load errors', async () => {
			const error = new Error('Failed to load ingredients');
			vi.mocked(ingredientsService.getIngredients).mockRejectedValue(error);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.error).toBe('Failed to load ingredients');
			expect(result.current.ingredients).toEqual([]);
		});
	});

	describe('createIngredient', () => {
		it('should create a new ingredient and reload list', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newIngredient: CreateIngredient = {
				name: 'Salmon',
				calories: 208,
				protein: 20,
				carbs: 0,
				fat: 13,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			};

			const createdIngredient: Ingredient = withMetadata({
				id: '3',
				...newIngredient,
			});

			vi.mocked(ingredientsService.createIngredient).mockResolvedValue(createdIngredient);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Create ingredient
			await act(async () => {
				await result.current.createIngredient(newIngredient);
			});

			expect(ingredientsService.createIngredient).toHaveBeenCalledWith(newIngredient);
			// Should reload after create
			expect(ingredientsService.getIngredients).toHaveBeenCalledTimes(2);
		});

		it('should handle creation errors', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newIngredient: CreateIngredient = {
				name: 'Salmon',
				calories: 208,
				protein: 20,
				carbs: 0,
				fat: 13,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			};

			const error = new Error('Creation failed');
			vi.mocked(ingredientsService.createIngredient).mockRejectedValue(error);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.createIngredient(newIngredient)).rejects.toThrow('Creation failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Creation failed');
			});
		});

		it('should clear error state before creation', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const newIngredient: CreateIngredient = {
				name: 'Salmon',
				calories: 208,
				protein: 20,
				carbs: 0,
				fat: 13,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
			};

			const createdIngredient: Ingredient = withMetadata({
				id: '3',
				...newIngredient,
			});

			vi.mocked(ingredientsService.createIngredient).mockResolvedValue(createdIngredient);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Create ingredient
			await act(async () => {
				await result.current.createIngredient(newIngredient);
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('updateIngredient', () => {
		it('should update an ingredient and reload list', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const updateData = {
				name: 'Updated Chicken',
				calories: 170,
				protein: 32,
				carbs: 1,
				fat: 4,
				servingSize: 100,
				version: 1,
				unit: 'g',
				category: 'Protein',
			};

			const updatedIngredient: Ingredient = withMetadata({
				id: '1',
				...updateData,
			});

			vi.mocked(ingredientsService.updateIngredient).mockResolvedValue(updatedIngredient);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Update ingredient
			await act(async () => {
				await result.current.updateIngredient('1', updateData);
			});

			expect(ingredientsService.updateIngredient).toHaveBeenCalledWith('1', updateData);
			// Should reload after update
			expect(ingredientsService.getIngredients).toHaveBeenCalledTimes(2);
		});

		it('should handle update errors', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const updateData = {
				name: 'Updated Chicken',
				calories: 170,
				protein: 32,
				carbs: 1,
				fat: 4,
				servingSize: 100,
				version: 1,
				unit: 'g',
				category: 'Protein',
			};

			const error = new Error('Update failed');
			vi.mocked(ingredientsService.updateIngredient).mockRejectedValue(error);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.updateIngredient('1', updateData)).rejects.toThrow('Update failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Update failed');
			});
		});
	});

	describe('deleteIngredient', () => {
		it('should delete an ingredient and reload list', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});
			vi.mocked(ingredientsService.deleteIngredient).mockResolvedValue(undefined);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Delete ingredient
			await act(async () => {
				await result.current.deleteIngredient('1');
			});

			expect(ingredientsService.deleteIngredient).toHaveBeenCalledWith('1');
			// Should reload after delete
			expect(ingredientsService.getIngredients).toHaveBeenCalledTimes(2);
		});

		it('should handle deletion errors', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const error = new Error('Deletion failed');
			vi.mocked(ingredientsService.deleteIngredient).mockRejectedValue(error);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await expect(result.current.deleteIngredient('1')).rejects.toThrow('Deletion failed');
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBe('Deletion failed');
			});
		});
	});

	describe('clearError', () => {
		it('should clear error state', async () => {
			const error = new Error('Failed to load ingredients');
			vi.mocked(ingredientsService.getIngredients).mockRejectedValue(error);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.error).toBe('Failed to load ingredients');
			});

			// Clear error
			act(() => {
				result.current.clearError();
			});

			// Wait for state update to complete
			await waitFor(() => {
				expect(result.current.error).toBeNull();
			});
		});
	});

	describe('computed values', () => {
		it('should calculate totalCount correctly', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.totalCount).toBe(2);
		});

		it('should calculate macroTotals using service', async () => {
			vi.mocked(ingredientsService.getIngredients).mockResolvedValue({
				items: mockIngredients,
				pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
			});

			const mockMacros = {
				totalCalories: 288,
				totalProtein: 33.6,
				totalCarbs: 25.6,
				totalFat: 4.5,
			};

			vi.mocked(ingredientsService.calculateTotalMacros).mockReturnValue(mockMacros);

			const { result } = renderHook(() => useIngredients());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.macroTotals).toEqual(mockMacros);
			expect(ingredientsService.calculateTotalMacros).toHaveBeenCalledWith(mockIngredients);
		});
	});
});
