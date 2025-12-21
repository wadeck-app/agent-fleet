import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateIngredient, Ingredient, PatchIngredient, UpdateIngredient } from '@app/shared';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared';

import type { IngredientsRepository } from '../repositories/IngredientsRepository';
import { IngredientsService } from './IngredientsService';

/**
 * ===========================================================================================
 * INGREDIENTS SERVICE - EDGE CASE TESTS
 * ===========================================================================================
 *
 * Comprehensive edge case testing for:
 * - Boundary conditions (pagination limits, zero values)
 * - Error code validation
 * - Concurrent modification scenarios
 * - Input sanitization edge cases
 * - Business rule violations
 *
 * Coverage Target: 90%+ for business logic
 *
 * ===========================================================================================
 */

describe('IngredientsService - Edge Cases', () => {
	let service: IngredientsService;
	let mockRepository: IngredientsRepository;

	const sampleIngredient: Ingredient = {
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
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	beforeEach(() => {
		mockRepository = {
			findAll: vi.fn(),
			findById: vi.fn(),
			findByCategory: vi.fn(),
			findHighProtein: vi.fn(),
			findLowCalorieInCategory: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as IngredientsRepository;

		service = new IngredientsService(mockRepository);
	});

	describe('list - Pagination Edge Cases', () => {
		it('should handle page number 0 by treating it as page 1', async () => {
			const ingredients = [sampleIngredient];
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 0 as any });

			// Implicit conversion: page 0 should behave like page 1
			expect(result.pagination.page).toBe(1);
		});

		it('should handle negative page size by using default', async () => {
			const ingredients = [sampleIngredient];
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ pageSize: -5 as any });

			// Should use default or minimum (10)
			expect(result.pagination.pageSize).toBeGreaterThan(0);
		});

		it('should handle pageSize of 0 by using default', async () => {
			const ingredients = [sampleIngredient];
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ pageSize: 0 as any });

			// Should use default (10)
			expect(result.pagination.pageSize).toBeGreaterThan(0);
		});

		it('should handle page beyond total pages', async () => {
			const ingredients = [sampleIngredient];
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 999, pageSize: 10 });

			// Should return empty items but valid pagination
			expect(result.items).toHaveLength(0);
			expect(result.pagination.page).toBe(999);
			expect(result.pagination.total).toBe(1);
		});

		it('should handle exactly 100 items with pageSize 100', async () => {
			const ingredients = Array.from({ length: 100 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 1, pageSize: 100 });

			expect(result.items).toHaveLength(100);
			expect(result.pagination.totalPages).toBe(1);
		});

		it('should handle 101 items with pageSize 100', async () => {
			const ingredients = Array.from({ length: 101 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 1, pageSize: 100 });

			expect(result.items).toHaveLength(100);
			expect(result.pagination.totalPages).toBe(2);

			const page2 = await service.list({ page: 2, pageSize: 100 });
			expect(page2.items).toHaveLength(1);
		});
	});

	describe('getById - Error Code Validation', () => {
		it('should throw NotFoundException with correct error code', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			try {
				await service.getById('999');
				expect.fail('Should have thrown NotFoundException');
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
				expect((error as any).code).toBe(ERROR_CODES.INGREDIENT_NOT_FOUND);
				expect((error as any).statusCode).toBe(404);
			}
		});

		it('should handle empty string ID', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById('')).rejects.toThrow(NotFoundException);
		});

		it('should handle very long ID strings', async () => {
			const longId = 'a'.repeat(1000);
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById(longId)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith(longId);
		});
	});

	describe('create - Zero Values and Boundaries', () => {
		it('should allow creation with zero calories', async () => {
			const createData: CreateIngredient = {
				name: 'Celery',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				servingSize: 0.1, // Minimum positive value
			};

			const created: Ingredient = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.calories).toBe(0);
		});

		it('should handle creation with very large numbers', async () => {
			const createData: CreateIngredient = {
				name: 'High Calorie Food',
				calories: 999999,
				protein: 9999,
				carbs: 9999,
				fat: 9999,
				servingSize: 1000,
			};

			const created: Ingredient = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.calories).toBe(999999);
		});

		it('should handle creation with minimal serving size (0.1)', async () => {
			const createData: CreateIngredient = {
				name: 'Spice',
				calories: 5,
				protein: 0.1,
				carbs: 0.1,
				fat: 0.1,
				servingSize: 0.1,
			};

			const created: Ingredient = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			const result = await service.create(createData);
			expect(result.servingSize).toBe(0.1);
		});
	});

	describe('update - Optimistic Locking Edge Cases', () => {
		it('should throw ConflictException with correct error code on version mismatch', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 30,
				carbs: 5,
				fat: 4,
				servingSize: 100,
				version: 999, // Wrong version
			};

			try {
				await service.update('1', updateData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.VERSION_MISMATCH);
				expect((error as any).statusCode).toBe(409);
				expect((error as any).details).toEqual({
					expectedVersion: 999,
					currentVersion: 1,
				});
			}
		});

		it('should handle update with version 0', async () => {
			const ingredient: Ingredient = { ...sampleIngredient, version: 0 };
			vi.mocked(mockRepository.findById).mockResolvedValue(ingredient);

			const updateData: UpdateIngredient = {
				name: 'Updated',
				calories: 100,
				protein: 20,
				carbs: 5,
				fat: 2,
				servingSize: 100,
				version: 0,
			};

			const updated: Ingredient = { ...ingredient, ...updateData, version: 1 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.update('1', updateData);
			expect(result.version).toBe(1);
		});

		it('should handle update with very high version number', async () => {
			const ingredient: Ingredient = { ...sampleIngredient, version: 9999 };
			vi.mocked(mockRepository.findById).mockResolvedValue(ingredient);

			const updateData: UpdateIngredient = {
				name: 'Updated',
				calories: 100,
				protein: 20,
				carbs: 5,
				fat: 2,
				servingSize: 100,
				version: 9999,
			};

			const updated: Ingredient = { ...ingredient, ...updateData, version: 10000 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.update('1', updateData);
			expect(result.version).toBe(10000);
		});
	});

	describe('partialUpdate - Edge Cases', () => {
		it('should handle partial update with only version field', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const patchData: PatchIngredient = {
				version: 1,
			};

			const updated: Ingredient = { ...sampleIngredient, version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.version).toBe(2);
		});

		it('should handle partial update with single field change', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const patchData: PatchIngredient = {
				name: 'New Name',
				version: 1,
			};

			const updated: Ingredient = { ...sampleIngredient, name: 'New Name', version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.name).toBe('New Name');
			expect(result.version).toBe(2);
		});

		it('should handle partial update changing calories to 0', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const patchData: PatchIngredient = {
				calories: 0,
				version: 1,
			};

			const updated: Ingredient = { ...sampleIngredient, calories: 0, version: 2 };
			vi.mocked(mockRepository.update).mockResolvedValue(updated);

			const result = await service.partialUpdate('1', patchData);
			expect(result.calories).toBe(0);
		});

		it('should throw ConflictException on version mismatch in partialUpdate', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const patchData: PatchIngredient = {
				name: 'New Name',
				version: 999,
			};

			try {
				await service.partialUpdate('1', patchData);
				expect.fail('Should have thrown ConflictException');
			} catch (error) {
				expect(error).toBeInstanceOf(ConflictException);
				expect((error as any).code).toBe(ERROR_CODES.VERSION_MISMATCH);
			}
		});
	});

	describe('delete - Edge Cases', () => {
		it('should throw NotFoundException when deleting non-existent ingredient', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});

		it('should call delete after confirming existence', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			await service.delete('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.delete).toHaveBeenCalledWith('1');
		});

		it('should handle empty string ID in delete', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('')).rejects.toThrow(NotFoundException);
		});
	});

	describe('validateIngredientData - Business Rules', () => {
		it('should log warning when calories mismatch exceeds 10%', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const createData: CreateIngredient = {
				name: 'Test Food',
				calories: 100, // Declared
				protein: 20, // 20 * 4 = 80 kcal
				carbs: 20, // 20 * 4 = 80 kcal
				fat: 20, // 20 * 9 = 180 kcal
				// Total calculated: 340 kcal vs declared 100 kcal = 240% difference
				servingSize: 100,
			};

			const created: Ingredient = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			await service.create(createData);

			expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Calories mismatch'));

			consoleWarnSpy.mockRestore();
		});

		it('should not log warning when calories are within 10% margin', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const createData: CreateIngredient = {
				name: 'Test Food',
				calories: 100, // Declared
				protein: 5, // 5 * 4 = 20 kcal
				carbs: 15, // 15 * 4 = 60 kcal
				fat: 2, // 2 * 9 = 18 kcal
				// Total calculated: 98 kcal vs declared 100 kcal = 2% difference (within 10%)
				servingSize: 100,
			};

			const created: Ingredient = {
				...createData,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			await service.create(createData);

			expect(consoleWarnSpy).not.toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});

		it('should handle validation when some macros are undefined', async () => {
			const createData: CreateIngredient = {
				name: 'Test Food',
				calories: 100,
				protein: 10,
				carbs: undefined as any,
				fat: 5,
				servingSize: 100,
			};

			const created: Ingredient = {
				...createData,
				carbs: 0,
				id: '1',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(created);

			// Should not throw, validation only runs when all macros are defined
			await expect(service.create(createData)).resolves.toBeDefined();
		});
	});
});
