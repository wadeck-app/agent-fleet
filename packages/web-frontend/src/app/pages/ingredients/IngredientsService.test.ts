import { withMetadata } from '@framework/tests/withMetadata';
import type { CreateIngredient, Ingredient } from '@shared/api/ingredients.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ingredientsApi } from '@app/api/client';

import { IngredientsService } from './IngredientsService';

// Mock the API client
vi.mock('@app/api/client', () => ({
	ingredientsApi: {
		getAll: vi.fn(),
		getById: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

describe('IngredientsService', () => {
	let service: IngredientsService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new IngredientsService();
	});

	describe('getAllIngredients', () => {
		it('should return all ingredients from API', async () => {
			const mockIngredients: Ingredient[] = [
				{
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				{
					id: '2',
					name: 'Brown Rice',
					calories: 123,
					protein: 2.6,
					carbs: 25.6,
					fat: 0.9,
					servingSize: 100,
					unit: 'g',
					category: 'Grains',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
			];

			vi.mocked(ingredientsApi.getAll).mockResolvedValue({
				items: mockIngredients,
				pagination: {
					total: 2,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getAllIngredients();

			expect(ingredientsApi.getAll).toHaveBeenCalledOnce();
			expect(result).toEqual(mockIngredients);
		});

		it('should handle API errors', async () => {
			const error = new Error('API Error');
			vi.mocked(ingredientsApi.getAll).mockRejectedValue(error);

			await expect(service.getAllIngredients()).rejects.toThrow('API Error');
		});
	});

	describe('getIngredient', () => {
		it('should return a single ingredient by ID', async () => {
			const mockIngredient: Ingredient = {
				id: '1',
				name: 'Chicken Breast',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
				version: 1,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			};

			vi.mocked(ingredientsApi.getById).mockResolvedValue(mockIngredient);

			const result = await service.getIngredient('1');

			expect(ingredientsApi.getById).toHaveBeenCalledWith('1');
			expect(result).toEqual(mockIngredient);
		});

		it('should handle not found errors', async () => {
			const error = new Error('Ingredient not found');
			vi.mocked(ingredientsApi.getById).mockRejectedValue(error);

			await expect(service.getIngredient('nonexistent')).rejects.toThrow('Ingredient not found');
		});
	});

	describe('createIngredient', () => {
		it('should create a new ingredient', async () => {
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

			const createdIngredient: Ingredient = {
				id: '3',
				...newIngredient,
				version: 1,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			};

			vi.mocked(ingredientsApi.create).mockResolvedValue(createdIngredient);

			const result = await service.createIngredient(newIngredient);

			expect(ingredientsApi.create).toHaveBeenCalledWith(newIngredient);
			expect(result).toEqual(createdIngredient);
		});

		it('should handle creation errors', async () => {
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
			vi.mocked(ingredientsApi.create).mockRejectedValue(error);

			await expect(service.createIngredient(newIngredient)).rejects.toThrow('Creation failed');
		});
	});

	describe('updateIngredient', () => {
		it('should update an existing ingredient', async () => {
			const updateData: CreateIngredient & { version: number } = {
				name: 'Updated Chicken',
				calories: 170,
				protein: 32,
				carbs: 1,
				fat: 4,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				id: '1',
				...updateData,
				version: 2,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T12:00:00Z',
			};

			vi.mocked(ingredientsApi.update).mockResolvedValue(updatedIngredient);

			const result = await service.updateIngredient('1', updateData);

			expect(ingredientsApi.update).toHaveBeenCalledWith('1', updateData);
			expect(result).toEqual(updatedIngredient);
		});

		it('should handle update errors', async () => {
			const updateData: CreateIngredient & { version: number } = {
				name: 'Updated Chicken',
				calories: 170,
				protein: 32,
				carbs: 1,
				fat: 4,
				servingSize: 100,
				unit: 'g',
				category: 'Protein',
				version: 1,
			};

			const error = new Error('Update failed');
			vi.mocked(ingredientsApi.update).mockRejectedValue(error);

			await expect(service.updateIngredient('1', updateData)).rejects.toThrow('Update failed');
		});
	});

	describe('deleteIngredient', () => {
		it('should delete an ingredient', async () => {
			vi.mocked(ingredientsApi.delete).mockResolvedValue({ id: '1', success: true });

			await service.deleteIngredient('1');

			expect(ingredientsApi.delete).toHaveBeenCalledWith('1');
		});

		it('should handle deletion errors', async () => {
			const error = new Error('Deletion failed');
			vi.mocked(ingredientsApi.delete).mockRejectedValue(error);

			await expect(service.deleteIngredient('1')).rejects.toThrow('Deletion failed');
		});
	});

	describe('calculateTotalMacros', () => {
		it('should calculate total macros correctly for multiple ingredients', () => {
			const ingredients: Ingredient[] = [
				{
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				{
					id: '2',
					name: 'Brown Rice',
					calories: 123,
					protein: 2.6,
					carbs: 25.6,
					fat: 0.9,
					servingSize: 100,
					unit: 'g',
					category: 'Grains',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
			];

			const result = service.calculateTotalMacros(ingredients);

			expect(result).toEqual({
				totalCalories: 288,
				totalProtein: 33.6,
				totalCarbs: 25.6,
				totalFat: 4.5,
			});
		});

		it('should return zeros for empty array', () => {
			const result = service.calculateTotalMacros([]);

			expect(result).toEqual({
				totalCalories: 0,
				totalProtein: 0,
				totalCarbs: 0,
				totalFat: 0,
			});
		});

		it('should handle single ingredient', () => {
			const ingredients: Ingredient[] = [
				{
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
			];

			const result = service.calculateTotalMacros(ingredients);

			expect(result).toEqual({
				totalCalories: 165,
				totalProtein: 31,
				totalCarbs: 0,
				totalFat: 3.6,
			});
		});
	});

	describe('getIngredientsByCategory', () => {
		it('should filter ingredients by category', async () => {
			const mockIngredients: Ingredient[] = [
				{
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				{
					id: '2',
					name: 'Brown Rice',
					calories: 123,
					protein: 2.6,
					carbs: 25.6,
					fat: 0.9,
					servingSize: 100,
					unit: 'g',
					category: 'Grains',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				{
					id: '3',
					name: 'Salmon',
					calories: 208,
					protein: 20,
					carbs: 0,
					fat: 13,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
					version: 1,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
			];

			vi.mocked(ingredientsApi.getAll).mockResolvedValue({
				items: mockIngredients,
				pagination: {
					total: 3,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getIngredientsByCategory('Protein');

			expect(result).toHaveLength(2);
			expect(result[0]?.category).toBe('Protein');
			expect(result[1]?.category).toBe('Protein');
		});

		it('should be case insensitive', async () => {
			const mockIngredients: Ingredient[] = [
				withMetadata({
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
				}),
			];

			vi.mocked(ingredientsApi.getAll).mockResolvedValue({
				items: mockIngredients,
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getIngredientsByCategory('protein');

			expect(result).toHaveLength(1);
			expect(result[0]?.category).toBe('Protein');
		});

		it('should return empty array when no matches', async () => {
			const mockIngredients: Ingredient[] = [
				withMetadata({
					id: '1',
					name: 'Chicken Breast',
					calories: 165,
					protein: 31,
					carbs: 0,
					fat: 3.6,
					servingSize: 100,
					unit: 'g',
					category: 'Protein',
				}),
			];

			vi.mocked(ingredientsApi.getAll).mockResolvedValue({
				items: mockIngredients,
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			});

			const result = await service.getIngredientsByCategory('Vegetables');

			expect(result).toHaveLength(0);
		});
	});
});
