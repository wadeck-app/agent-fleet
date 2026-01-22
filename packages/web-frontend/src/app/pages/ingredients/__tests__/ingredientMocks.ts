import { withMetadata } from '@framework/tests/withMetadata';
import type { Ingredient, IngredientListResponse } from '@shared/api/ingredients.contract';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';
import { vi } from 'vitest';

export const mockIngredients = {
	chickenBreast: withMetadata({
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
	brownRice: withMetadata({
		id: '2',
		name: 'Brown Rice',
		calories: 112,
		protein: 2.6,
		carbs: 24,
		fat: 0.9,
		servingSize: 100,
		unit: 'g',
		category: 'Grains',
	}),
	broccoli: withMetadata({
		id: '3',
		name: 'Broccoli',
		calories: 55,
		protein: 3.7,
		carbs: 11.2,
		fat: 0.6,
		servingSize: 100,
		unit: 'g',
		category: 'Vegetables',
	}),
} as const;

export const mockIngredientList: Ingredient[] = Object.values(mockIngredients);

export function createMockListResponse(items: Ingredient[], page = 1, pageSize = 10): IngredientListResponse {
	const start = (page - 1) * pageSize;
	const end = start + pageSize;
	const paginatedItems = items.slice(start, end);

	return {
		items: paginatedItems,
		pagination: {
			page,
			pageSize,
			total: items.length,
			totalPages: Math.ceil(items.length / pageSize),
		},
	};
}

export function createMockBulkDeleteResponse(
	deleted: string[],
	failed: Array<{ id: string; reason: string; code: string }> = []
): BulkDeleteResponse {
	return {
		success: true,
		deleted,
		failed,
		totalRequested: deleted.length + failed.length,
		totalDeleted: deleted.length,
		totalFailed: failed.length,
	};
}

// Mocks at module level for hoisting
const mockGetIngredients = vi.fn().mockResolvedValue(createMockListResponse(mockIngredientList));
const mockGetIngredient = vi.fn((id: string) => {
	const ingredient = mockIngredientList.find(i => i.id === id);
	return ingredient ? Promise.resolve(ingredient) : Promise.reject(new Error(`Ingredient ${id} not found`));
});
const mockCreateIngredient = vi.fn(data => Promise.resolve(withMetadata({ id: `new-${Date.now()}`, ...data })));
const mockUpdateIngredient = vi.fn((id: string, data) => {
	const existing = mockIngredientList.find(i => i.id === id);
	if (!existing) return Promise.reject(new Error(`Ingredient ${id} not found`));
	return Promise.resolve(withMetadata({ ...existing, ...data, id }));
});
const mockDeleteIngredient = vi.fn().mockResolvedValue(undefined);
const mockBulkDeleteIngredients = vi.fn((ids: string[]) => Promise.resolve(createMockBulkDeleteResponse(ids)));
const mockCalculateTotalMacros = vi.fn((ingredients: Ingredient[]) => ({
	totalCalories: ingredients.reduce((sum: number, i: Ingredient) => sum + (i.calories || 0), 0),
	totalProtein: ingredients.reduce((sum: number, i: Ingredient) => sum + (i.protein || 0), 0),
	totalCarbs: ingredients.reduce((sum: number, i: Ingredient) => sum + (i.carbs || 0), 0),
	totalFat: ingredients.reduce((sum: number, i: Ingredient) => sum + (i.fat || 0), 0),
}));

vi.mock('@app/pages/ingredients/IngredientsService', () => ({
	ingredientsService: {
		getIngredients: mockGetIngredients,
		getIngredient: mockGetIngredient,
		createIngredient: mockCreateIngredient,
		updateIngredient: mockUpdateIngredient,
		deleteIngredient: mockDeleteIngredient,
		bulkDeleteIngredients: mockBulkDeleteIngredients,
		calculateTotalMacros: mockCalculateTotalMacros,
	},
	IngredientsService: vi.fn(() => ({
		getIngredients: mockGetIngredients,
		getIngredient: mockGetIngredient,
		createIngredient: mockCreateIngredient,
		updateIngredient: mockUpdateIngredient,
		deleteIngredient: mockDeleteIngredient,
		bulkDeleteIngredients: mockBulkDeleteIngredients,
		calculateTotalMacros: mockCalculateTotalMacros,
	})),
}));

export function setupIngredientServiceMocks() {
	return {
		mocks: {
			getIngredients: mockGetIngredients,
			getIngredient: mockGetIngredient,
			createIngredient: mockCreateIngredient,
			updateIngredient: mockUpdateIngredient,
			deleteIngredient: mockDeleteIngredient,
			bulkDeleteIngredients: mockBulkDeleteIngredients,
			calculateTotalMacros: mockCalculateTotalMacros,
		},
		cleanup: () => vi.clearAllMocks(),
	};
}
