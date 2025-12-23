import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CreateIngredient,
	Ingredient,
	IngredientsListQuery,
	PatchIngredient,
	UpdateIngredient,
} from '@app/shared';
import { ConflictException, NotFoundException } from '@app/shared';
import { INGREDIENTS_API_ROUTES } from '@app/shared';

import type { IngredientsService } from '../services/IngredientsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import IngredientsController from './IngredientsController';

/**
 * ===========================================================================================
 * INGREDIENTS CONTROLLER TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the IngredientsService (unit test - no real dependencies)
 * - Test all CRUD operations
 * - Test error scenarios (NotFoundException, ConflictException)
 * - Test pagination via service delegation
 *
 * ===========================================================================================
 */

describe('IngredientsController', () => {
	let controller: IngredientsController;
	let mockService: IngredientsService;
	let routes: Map<string, (...args: any[]) => Promise<any>>;

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

	const createIngredientData: CreateIngredient = {
		name: 'Brown Rice',
		calories: 111,
		protein: 2.6,
		carbs: 23,
		fat: 0.9,
		servingSize: 100,
		unit: 'g',
		category: 'Grains',
	};

	beforeEach(() => {
		// Create mock service with all methods
		mockService = {
			list: vi.fn(),
			getById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			partialUpdate: vi.fn(),
			delete: vi.fn(),
		} as unknown as IngredientsService;

		// Create controller with mock service
		controller = new IngredientsController(mockService);

		// Capture routes
		routes = new Map();
		const mockAdd: RouteWrapperFunc<typeof INGREDIENTS_API_ROUTES> = (method, path, handler) => {
			routes.set(`${method} ${path}`, handler);
		};

		controller.configureRoutes(mockAdd);
	});

	describe('GET /api/ingredients - List all ingredients', () => {
		it('should list all ingredients with default pagination', async () => {
			const expectedResponse = {
				items: [sampleIngredient],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/ingredients/');
			expect(handler).toBeDefined();

			const result = await handler!({ query: {} });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith({});
		});

		it('should list ingredients with search filter', async () => {
			const query: IngredientsListQuery = { search: 'Chicken' };
			const expectedResponse = {
				items: [sampleIngredient],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/ingredients/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});

		it('should list ingredients with category filter', async () => {
			const query: IngredientsListQuery = { category: 'Protein' };
			const expectedResponse = {
				items: [sampleIngredient],
				pagination: {
					total: 1,
					page: 1,
					pageSize: 10,
					totalPages: 1,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/ingredients/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});

		it('should list ingredients with pagination parameters', async () => {
			const query: IngredientsListQuery = { page: 2, pageSize: 5 };
			const expectedResponse = {
				items: [sampleIngredient],
				pagination: {
					total: 10,
					page: 2,
					pageSize: 5,
					totalPages: 2,
				},
			};

			vi.mocked(mockService.list).mockResolvedValue(expectedResponse);

			const handler = routes.get('GET /api/ingredients/');
			const result = await handler!({ query });

			expect(result).toEqual(expectedResponse);
			expect(mockService.list).toHaveBeenCalledWith(query);
		});
	});

	describe('GET /api/ingredients/:id - Get ingredient by ID', () => {
		it('should return an ingredient when found', async () => {
			vi.mocked(mockService.getById).mockResolvedValue(sampleIngredient);

			const handler = routes.get('GET /api/ingredients/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' } });

			expect(result).toEqual(sampleIngredient);
			expect(mockService.getById).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when ingredient not found', async () => {
			vi.mocked(mockService.getById).mockRejectedValue(new NotFoundException('Ingredient with id 999 not found'));

			const handler = routes.get('GET /api/ingredients/:id');

			await expect(handler!({ params: { id: '999' } })).rejects.toThrow(NotFoundException);
			expect(mockService.getById).toHaveBeenCalledWith('999');
		});
	});

	describe('POST /api/ingredients - Create a new ingredient', () => {
		it('should create a new ingredient successfully', async () => {
			const createdIngredient: Ingredient = {
				...createIngredientData,
				id: '2',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockService.create).mockResolvedValue(createdIngredient);

			const handler = routes.get('POST /api/ingredients/');
			expect(handler).toBeDefined();

			const result = await handler!({ body: createIngredientData });

			expect(result).toEqual(createdIngredient);
			expect(mockService.create).toHaveBeenCalledWith(createIngredientData);
		});

		it('should create an ingredient without optional fields', async () => {
			const minimalIngredientData: CreateIngredient = {
				name: 'Test Ingredient',
				calories: 100,
				protein: 10,
				carbs: 5,
				fat: 2,
				servingSize: 50,
			};

			const createdIngredient: Ingredient = {
				...minimalIngredientData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockService.create).mockResolvedValue(createdIngredient);

			const handler = routes.get('POST /api/ingredients/');
			const result = await handler!({ body: minimalIngredientData });

			expect(result).toEqual(createdIngredient);
			expect(mockService.create).toHaveBeenCalledWith(minimalIngredientData);
		});
	});

	describe('PUT /api/ingredients/:id - Update an existing ingredient', () => {
		it('should update an ingredient successfully', async () => {
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

			vi.mocked(mockService.update).mockResolvedValue(updatedIngredient);

			const handler = routes.get('PUT /api/ingredients/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' }, body: updateData });

			expect(result).toEqual(updatedIngredient);
			expect(mockService.update).toHaveBeenCalledWith('1', updateData);
		});

		it('should throw NotFoundException when updating non-existent ingredient', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				version: 1,
			};

			vi.mocked(mockService.update).mockRejectedValue(new NotFoundException('Ingredient with id 999 not found'));

			const handler = routes.get('PUT /api/ingredients/:id');

			await expect(handler!({ params: { id: '999' }, body: updateData })).rejects.toThrow(NotFoundException);
			expect(mockService.update).toHaveBeenCalledWith('999', updateData);
		});

		it('should throw ConflictException on version mismatch (optimistic locking)', async () => {
			const updateData: UpdateIngredient = {
				name: 'Updated Name',
				calories: 200,
				protein: 35,
				carbs: 5,
				fat: 4.0,
				servingSize: 100,
				version: 1,
			};

			vi.mocked(mockService.update).mockRejectedValue(
				new ConflictException(
					'Ingredient has been modified by another user. Expected version 1, but current version is 2.'
				)
			);

			const handler = routes.get('PUT /api/ingredients/:id');

			await expect(handler!({ params: { id: '1' }, body: updateData })).rejects.toThrow(ConflictException);
			expect(mockService.update).toHaveBeenCalledWith('1', updateData);
		});
	});

	describe('PATCH /api/ingredients/:id - Partially update an ingredient', () => {
		it('should partially update an ingredient successfully', async () => {
			const patchData: PatchIngredient = {
				name: 'Partially Updated Chicken',
				version: 1,
			};

			const updatedIngredient: Ingredient = {
				...sampleIngredient,
				name: 'Partially Updated Chicken',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockService.partialUpdate).mockResolvedValue(updatedIngredient);

			const handler = routes.get('PATCH /api/ingredients/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' }, body: patchData });

			expect(result).toEqual(updatedIngredient);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('1', patchData);
		});

		it('should throw NotFoundException when patching non-existent ingredient', async () => {
			const patchData: PatchIngredient = {
				name: 'Updated',
				version: 1,
			};

			vi.mocked(mockService.partialUpdate).mockRejectedValue(
				new NotFoundException('Ingredient with id 999 not found')
			);

			const handler = routes.get('PATCH /api/ingredients/:id');

			await expect(handler!({ params: { id: '999' }, body: patchData })).rejects.toThrow(NotFoundException);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('999', patchData);
		});

		it('should throw ConflictException on version mismatch', async () => {
			const patchData: PatchIngredient = {
				name: 'Updated',
				version: 1,
			};

			vi.mocked(mockService.partialUpdate).mockRejectedValue(
				new ConflictException(
					'Ingredient has been modified by another user. Expected version 1, but current version is 2.'
				)
			);

			const handler = routes.get('PATCH /api/ingredients/:id');

			await expect(handler!({ params: { id: '1' }, body: patchData })).rejects.toThrow(ConflictException);
			expect(mockService.partialUpdate).toHaveBeenCalledWith('1', patchData);
		});
	});

	describe('DELETE /api/ingredients/:id - Delete an ingredient', () => {
		it('should delete an ingredient successfully', async () => {
			vi.mocked(mockService.delete).mockResolvedValue(undefined);

			const handler = routes.get('DELETE /api/ingredients/:id');
			expect(handler).toBeDefined();

			const result = await handler!({ params: { id: '1' } });

			expect(result).toEqual({ success: true, id: '1' });
			expect(mockService.delete).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when deleting non-existent ingredient', async () => {
			vi.mocked(mockService.delete).mockRejectedValue(new NotFoundException('Ingredient with id 999 not found'));

			const handler = routes.get('DELETE /api/ingredients/:id');

			await expect(handler!({ params: { id: '999' } })).rejects.toThrow(NotFoundException);
			expect(mockService.delete).toHaveBeenCalledWith('999');
		});
	});

	describe('Route registration', () => {
		it('should register all 6 routes', () => {
			expect(routes.size).toBe(6);
			expect(routes.has('GET /api/ingredients/')).toBe(true);
			expect(routes.has('GET /api/ingredients/:id')).toBe(true);
			expect(routes.has('POST /api/ingredients/')).toBe(true);
			expect(routes.has('PUT /api/ingredients/:id')).toBe(true);
			expect(routes.has('PATCH /api/ingredients/:id')).toBe(true);
			expect(routes.has('DELETE /api/ingredients/:id')).toBe(true);
		});

		it('should have static routes property', () => {
			expect(IngredientsController.routes).toBeDefined();
			expect(IngredientsController.routes).toBe(INGREDIENTS_API_ROUTES);
		});
	});
});
