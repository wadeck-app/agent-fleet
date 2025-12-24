import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ingredient, IngredientsListQuery } from '@app/shared/api/ingredients.contract';

import type { QueryBuilder } from '../storage/QueryBuilder';
import type { BaseRepository } from './BaseRepository';
import { IngredientsRepository } from './IngredientsRepository';

/**
 * ===========================================================================================
 * INGREDIENTS REPOSITORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock BaseRepository (unit test - no real storage)
 * - Test domain-specific query methods
 * - Test filter composition (search, category)
 * - Test delegation to BaseRepository
 *
 * ===========================================================================================
 */

describe('IngredientsRepository', () => {
	let repository: IngredientsRepository;
	let mockBaseRepository: BaseRepository<Ingredient>;
	let mockQueryBuilder: QueryBuilder<Ingredient>;

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
		// Create mock query builder
		mockQueryBuilder = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		} as unknown as QueryBuilder<Ingredient>;

		// Create mock base repository
		mockBaseRepository = {
			query: vi.fn().mockReturnValue(mockQueryBuilder),
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as BaseRepository<Ingredient>;

		// Create repository with mock base
		repository = new IngredientsRepository(mockBaseRepository);
	});

	describe('findAll - Find all ingredients with filters', () => {
		it('should return all ingredients when no filters provided', async () => {
			const ingredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(ingredients);

			const result = await repository.findAll();

			expect(result).toEqual(ingredients);
			expect(mockBaseRepository.query).toHaveBeenCalled();
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (name or category)', async () => {
			const query: IngredientsListQuery = { search: 'Chicken' };
			const allIngredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allIngredients);

			const result = await repository.findAll(query);

			// Should filter client-side for search
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleIngredient);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (case-insensitive)', async () => {
			const query: IngredientsListQuery = { search: 'CHICKEN' };
			const allIngredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allIngredients);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleIngredient);
		});

		it('should filter by search in category field', async () => {
			const query: IngredientsListQuery = { search: 'Grains' };
			const allIngredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allIngredients);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherIngredient);
		});

		it('should filter by category (using query builder)', async () => {
			const query: IngredientsListQuery = { category: 'Protein' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleIngredient]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleIngredient]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'Protein');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no matches found', async () => {
			const query: IngredientsListQuery = { search: 'NonExistent' };
			const allIngredients = [sampleIngredient, anotherIngredient];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allIngredients);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(0);
		});

		it('should handle ingredients without category in search', async () => {
			const ingredientNoCategory: Ingredient = {
				...sampleIngredient,
				id: '3',
				category: undefined,
			};
			const query: IngredientsListQuery = { search: 'Chicken' };
			const allIngredients = [ingredientNoCategory];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allIngredients);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(ingredientNoCategory);
		});
	});

	describe('findById - Find ingredient by ID', () => {
		it('should return ingredient when found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(sampleIngredient);

			const result = await repository.findById('1');

			expect(result).toEqual(sampleIngredient);
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should return null when not found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(null);

			const result = await repository.findById('999');

			expect(result).toBeNull();
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('findByCategory - Find ingredients by category', () => {
		it('should find ingredients by category', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleIngredient]);

			const result = await repository.findByCategory('Protein');

			expect(result).toEqual([sampleIngredient]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'Protein');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when category not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByCategory('Unknown');

			expect(result).toEqual([]);
		});
	});

	describe('findHighProtein - Find high-protein ingredients', () => {
		it('should find ingredients with protein >= minProtein', async () => {
			const highProteinIngredient = {
				...sampleIngredient,
				protein: 35,
			};
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([highProteinIngredient, sampleIngredient]);

			const result = await repository.findHighProtein(30);

			expect(result).toEqual([highProteinIngredient, sampleIngredient]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('protein', '>=', 30);
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('protein', 'DESC');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no high-protein ingredients found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findHighProtein(50);

			expect(result).toEqual([]);
		});

		it('should order by protein descending', async () => {
			const lowProtein = { ...sampleIngredient, id: '1', protein: 10 };
			const midProtein = { ...sampleIngredient, id: '2', protein: 20 };
			const highProtein = { ...sampleIngredient, id: '3', protein: 30 };

			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([highProtein, midProtein, lowProtein]);

			const result = await repository.findHighProtein(5);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('protein', 'DESC');
			expect(result).toEqual([highProtein, midProtein, lowProtein]);
		});
	});

	describe('findLowCalorieInCategory - Find low-calorie ingredients in category', () => {
		it('should find low-calorie ingredients in specific category', async () => {
			const lowCalorieVeggie: Ingredient = {
				...sampleIngredient,
				id: '3',
				name: 'Lettuce',
				calories: 15,
				category: 'Vegetables',
			};

			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([lowCalorieVeggie]);

			const result = await repository.findLowCalorieInCategory('Vegetables', 50);

			expect(result).toEqual([lowCalorieVeggie]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'Vegetables');
			expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('calories', '<=', 50);
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('calories', 'ASC');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no matches found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findLowCalorieInCategory('Protein', 50);

			expect(result).toEqual([]);
		});

		it('should order by calories ascending', async () => {
			const lowCal = { ...sampleIngredient, id: '1', calories: 10 };
			const midCal = { ...sampleIngredient, id: '2', calories: 30 };
			const highCal = { ...sampleIngredient, id: '3', calories: 50 };

			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([lowCal, midCal, highCal]);

			const result = await repository.findLowCalorieInCategory('Protein', 100);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('calories', 'ASC');
			expect(result).toEqual([lowCal, midCal, highCal]);
		});
	});

	describe('create - Create a new ingredient', () => {
		it('should create an ingredient', async () => {
			const createData = {
				name: 'New Ingredient',
				calories: 100,
				protein: 10,
				carbs: 5,
				fat: 2,
				servingSize: 50,
				unit: 'g',
				category: 'Vegetables',
			};

			const createdIngredient: Ingredient = {
				...createData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.create).mockResolvedValue(createdIngredient);

			const result = await repository.create(createData);

			expect(result).toEqual(createdIngredient);
			expect(mockBaseRepository.create).toHaveBeenCalledWith(createData);
		});
	});

	describe('update - Update an existing ingredient', () => {
		it('should update an ingredient', async () => {
			const updateData = {
				name: 'Updated Name',
				version: 2,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				...updateData,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.update).mockResolvedValue(updatedIngredient);

			const result = await repository.update('1', updateData);

			expect(result).toEqual(updatedIngredient);
			expect(mockBaseRepository.update).toHaveBeenCalledWith('1', updateData);
		});
	});

	describe('delete - Delete an ingredient', () => {
		it('should delete an ingredient', async () => {
			vi.mocked(mockBaseRepository.delete).mockResolvedValue(undefined);

			await repository.delete('1');

			expect(mockBaseRepository.delete).toHaveBeenCalledWith('1');
		});
	});
});
