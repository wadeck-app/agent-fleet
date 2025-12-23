import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CreateIngredient,
	Ingredient,
	IngredientsListQuery,
	PatchIngredient,
	UpdateIngredient,
} from '@app/shared';
import { ConflictException, NotFoundException } from '@app/shared';

import type { IngredientsRepository } from '../repositories/IngredientsRepository';
import { IngredientsService } from './IngredientsService';

/**
 * ===========================================================================================
 * INGREDIENTS SERVICE TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the IngredientsRepository (unit test - no real dependencies)
 * - Test business logic: pagination, optimistic locking, calorie validation
 * - Test error handling (NotFoundException, ConflictException)
 * - Cover all edge cases
 *
 * ===========================================================================================
 */

describe('IngredientsService', () => {
	let service: IngredientsService;
	let mockRepository: IngredientsRepository;

	// Sample test data
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

	const anotherIngredient: Ingredient = {
		id: '2',
		name: 'Brown Rice',
		calories: 111,
		protein: 2.6,
		carbs: 23,
		fat: 0.9,
		servingSize: 100,
		unit: 'g',
		category: 'Grains',
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	beforeEach(() => {
		// Create mock repository
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

		// Create service with mock repository
		service = new IngredientsService(mockRepository);
	});

	describe('list - List ingredients with pagination and filters', () => {
		it('should list all ingredients with default pagination', async () => {
			const ingredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({});

			expect(result.items).toHaveLength(2);
			expect(result.items).toEqual(ingredients);
			expect(result.pagination).toEqual({
				total: 2,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			});
			expect(mockRepository.findAll).toHaveBeenCalledWith({});
		});

		it('should paginate results correctly - page 1', async () => {
			const ingredients = Array.from({ length: 15 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
				name: `Ingredient ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 1, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('1');
			expect(result.items[4].id).toBe('5');
			expect(result.pagination).toEqual({
				total: 15,
				page: 1,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - page 2', async () => {
			const ingredients = Array.from({ length: 15 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
				name: `Ingredient ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 2, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('6');
			expect(result.items[4].id).toBe('10');
			expect(result.pagination).toEqual({
				total: 15,
				page: 2,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - last page with fewer items', async () => {
			const ingredients = Array.from({ length: 15 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
				name: `Ingredient ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 3, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('11');
			expect(result.items[4].id).toBe('15');
			expect(result.pagination).toEqual({
				total: 15,
				page: 3,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should enforce maximum page size of 100', async () => {
			const ingredients = Array.from({ length: 200 }, (_, i) => ({
				...sampleIngredient,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(ingredients);

			const result = await service.list({ page: 1, pageSize: 150 });

			// Should be capped at 100
			expect(result.items).toHaveLength(100);
			expect(result.pagination!.pageSize).toBe(100);
			expect(result.pagination!.totalPages).toBe(2);
		});

		it('should handle empty results', async () => {
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.list({});

			expect(result.items).toHaveLength(0);
			expect(result.pagination).toEqual({
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
			});
		});

		it('should pass search filter to repository', async () => {
			const query: IngredientsListQuery = { search: 'Chicken' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIngredient]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass category filter to repository', async () => {
			const query: IngredientsListQuery = { category: 'Protein' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIngredient]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});
	});

	describe('getById - Get ingredient by ID', () => {
		it('should return ingredient when found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);

			const result = await service.getById('1');

			expect(result).toEqual(sampleIngredient);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when ingredient not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('create - Create a new ingredient', () => {
		const createData: CreateIngredient = {
			name: 'New Ingredient',
			calories: 100,
			protein: 10,
			carbs: 5,
			fat: 2,
			servingSize: 50,
			unit: 'g',
			category: 'Vegetables',
		};

		it('should create an ingredient successfully', async () => {
			const createdIngredient: Ingredient = {
				...createData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdIngredient);

			const result = await service.create(createData);

			expect(result).toEqual(createdIngredient);
			expect(mockRepository.create).toHaveBeenCalledWith(createData);
		});

		it('should create ingredient with valid calorie calculation', async () => {
			const validData: CreateIngredient = {
				name: 'Valid Ingredient',
				calories: 138, // protein*4 + carbs*4 + fat*9 = 10*4 + 5*4 + 10*9 = 40 + 20 + 90 = 150 (within 10%)
				protein: 10,
				carbs: 5,
				fat: 10,
				servingSize: 50,
			};

			const createdIngredient: Ingredient = {
				...validData,
				id: '4',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdIngredient);

			const result = await service.create(validData);

			expect(result).toEqual(createdIngredient);
			expect(mockRepository.create).toHaveBeenCalledWith(validData);
		});

		it('should create ingredient even with calorie mismatch (warning logged)', async () => {
			const mismatchData: CreateIngredient = {
				name: 'Mismatch Ingredient',
				calories: 50, // Declared much lower than calculated (10*4 + 5*4 + 10*9 = 150)
				protein: 10,
				carbs: 5,
				fat: 10,
				servingSize: 50,
			};

			const createdIngredient: Ingredient = {
				...mismatchData,
				id: '5',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			vi.mocked(mockRepository.create).mockResolvedValue(createdIngredient);

			const result = await service.create(mismatchData);

			expect(result).toEqual(createdIngredient);
			expect(mockRepository.create).toHaveBeenCalledWith(mismatchData);
			expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Calories mismatch'));

			consoleWarnSpy.mockRestore();
		});

		it('should create ingredient without optional fields', async () => {
			const minimalData: CreateIngredient = {
				name: 'Minimal Ingredient',
				calories: 100,
				protein: 10,
				carbs: 5,
				fat: 2,
				servingSize: 50,
			};

			const createdIngredient: Ingredient = {
				...minimalData,
				id: '6',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdIngredient);

			const result = await service.create(minimalData);

			expect(result).toEqual(createdIngredient);
			expect(mockRepository.create).toHaveBeenCalledWith(minimalData);
		});
	});

	describe('update - Update an existing ingredient', () => {
		it('should update ingredient successfully', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				name: 'Updated Name',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedIngredient);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				...updateData,
				version: 2, // Version incremented
			});
		});

		it('should throw NotFoundException when ingredient not found', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.update('999', updateData)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException on version mismatch', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				version: 1,
			};

			const currentIngredient: Ingredient = {
				...sampleIngredient,
				version: 2,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(currentIngredient);

			await expect(service.update('1', updateData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should update with calorie validation', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 150,
				protein: 10,
				carbs: 5,
				fat: 10,
				servingSize: 100,
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				...updateData,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedIngredient);
		});

		it('should skip validation when only version is provided', async () => {
			const updateData: UpdateIngredient = {
				name: 'Chicken Breast',
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedIngredient);
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				version: 2,
			});
		});

		it('should update ingredient with partial data', async () => {
			const updateData: UpdateIngredient = {
				name: 'Chicken Breast',
				calories: 180,
				protein: 31,
				carbs: 0,
				fat: 3.6,
				servingSize: 100,
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				calories: 180,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedIngredient);
		});
	});

	describe('partialUpdate - Partially update an ingredient (PATCH)', () => {
		it('should partially update ingredient with single field', async () => {
			const partialData: PatchIngredient = {
				name: 'Updated Chicken',
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				name: 'Updated Chicken',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedIngredient);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				name: 'Updated Chicken',
				version: 2,
			});
		});

		it('should partially update ingredient with multiple fields', async () => {
			const partialData: PatchIngredient = {
				name: 'Organic Chicken',
				protein: 33,
				fat: 2.5,
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				name: 'Organic Chicken',
				protein: 33,
				fat: 2.5,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedIngredient);
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				name: 'Organic Chicken',
				protein: 33,
				fat: 2.5,
				version: 2,
			});
		});

		it('should throw NotFoundException when ingredient not found', async () => {
			const partialData: PatchIngredient = {
				name: 'Updated',
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.partialUpdate('999', partialData)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException on version mismatch', async () => {
			const partialData: PatchIngredient = {
				name: 'Updated',
				version: 1,
			};

			const currentIngredient: Ingredient = {
				...sampleIngredient,
				version: 2,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(currentIngredient);

			await expect(service.partialUpdate('1', partialData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should validate ingredient data when updating nutritional fields', async () => {
			const partialData: PatchIngredient = {
				protein: 30,
				carbs: 5,
				fat: 10,
				calories: 250, // Should be ~250 (30*4 + 5*4 + 10*9 = 230)
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				protein: 30,
				carbs: 5,
				fat: 10,
				calories: 250,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedIngredient);
		});

		it('should handle only version provided (no-op update)', async () => {
			const partialData: PatchIngredient = {
				version: 1,
				// Only version, no other fields
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedIngredient);

			const result = await service.partialUpdate('1', partialData);

			expect(result).toEqual(updatedIngredient);
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				version: 2,
			});
		});
	});

	describe('delete - Delete an ingredient', () => {
		it('should delete ingredient successfully', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIngredient);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			await service.delete('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.delete).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when ingredient not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});
	});
});
