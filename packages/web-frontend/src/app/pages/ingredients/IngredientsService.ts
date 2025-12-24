import { createValidator } from '@framework/utils/validation/validation';
import { required } from '@framework/utils/validation/validation';
import { maxLength } from '@framework/utils/validation/validation';
import { optional } from '@framework/utils/validation/validation';
import { nonNegative } from '@framework/utils/validation/validation';
import { positive } from '@framework/utils/validation/validation';
import { combine } from '@framework/utils/validation/validation';
import { type ValidationResult } from '@framework/utils/validation/validation';
import type {
	CreateIngredient,
	Ingredient,
	IngredientListResponse,
	IngredientsListQuery,
} from '@shared/api/ingredients.contract';

import { ingredientsApi } from '@app/api/client';

/**
 * ===========================================================================================
 * INGREDIENTS SERVICE - Business Logic Layer
 * ===========================================================================================
 *
 * Responsibilities:
 * - Encapsulate business logic and data transformations
 * - Coordinate multiple API calls if needed
 * - Provide higher-level operations
 * - Keep the business rules centralized
 * - Validate data using centralized validation library
 *
 * Note: In this simple case, the service is thin. In real applications, this layer
 * would handle complex business logic like:
 * - Calculating nutritional scores
 * - Validating business rules
 * - Coordinating multiple API calls
 * - Caching strategies
 * - Data aggregations
 *
 * ===========================================================================================
 */

export interface GetIngredientsParams {
	page?: number;
	pageSize?: number;
	sortBy?: string; // comma-separated column names
	sortOrder?: string; // comma-separated asc/desc
	search?: string; // Simple search query (omnisearch)
}

export class IngredientsService {
	/**
	 * Centralized validation schema for ingredient data
	 */
	private readonly ingredientValidator = createValidator<CreateIngredient>({
		name: combine(required('Name'), maxLength(100, 'Name')),
		calories: nonNegative('Calories'),
		protein: nonNegative('Protein'),
		carbs: nonNegative('Carbs'),
		fat: nonNegative('Fat'),
		servingSize: positive('Serving size'),
		unit: optional(maxLength(20, 'Unit')),
		category: optional(maxLength(50, 'Category')),
	});

	/**
	 * Get ingredients with pagination and sorting
	 */
	async getIngredients(params?: GetIngredientsParams): Promise<IngredientListResponse> {
		const query: Partial<IngredientsListQuery> = {};
		if (params?.page) query.page = params.page;
		if (params?.pageSize) query.pageSize = params.pageSize;
		if (params?.sortBy) query.sortBy = params.sortBy;
		if (params?.sortOrder) query.sortOrder = params.sortOrder;
		if (params?.search) query.search = params.search;

		return await ingredientsApi.getAll(query as IngredientsListQuery);
	}

	/**
	 * Get all ingredients (legacy - use getIngredients for pagination/sorting)
	 */
	async getAllIngredients(): Promise<Ingredient[]> {
		const response = await ingredientsApi.getAll();
		return response.items;
	}

	/**
	 * Get a single ingredient by ID
	 */
	async getIngredient(id: string): Promise<Ingredient> {
		return await ingredientsApi.getById(id);
	}

	/**
	 * Validate ingredient data using centralized validation library
	 */
	validateIngredientData(data: CreateIngredient): ValidationResult {
		return this.ingredientValidator(data);
	}

	/**
	 * Create a new ingredient
	 */
	async createIngredient(data: CreateIngredient): Promise<Ingredient> {
		// Validate before sending to API
		const validation = this.validateIngredientData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await ingredientsApi.create(data);
	}

	/**
	 * Update an existing ingredient
	 */
	async updateIngredient(id: string, data: CreateIngredient & { version: number }): Promise<Ingredient> {
		// Validate before sending to API
		const validation = this.validateIngredientData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await ingredientsApi.update(id, data);
	}

	/**
	 * Delete an ingredient
	 */
	async deleteIngredient(id: string): Promise<void> {
		await ingredientsApi.delete(id);
	}

	/**
	 * Calculate total macros for a list of ingredients
	 * Example of business logic that would live in the service layer
	 */
	calculateTotalMacros(ingredients: Ingredient[]): {
		totalCalories: number;
		totalProtein: number;
		totalCarbs: number;
		totalFat: number;
	} {
		return ingredients.reduce(
			(acc, ingredient) => ({
				totalCalories: acc.totalCalories + ingredient.calories,
				totalProtein: acc.totalProtein + ingredient.protein,
				totalCarbs: acc.totalCarbs + ingredient.carbs,
				totalFat: acc.totalFat + ingredient.fat,
			}),
			{ totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
		);
	}

	/**
	 * Get ingredients by category
	 * Example of a higher-level operation that could coordinate filtering
	 */
	async getIngredientsByCategory(category: string): Promise<Ingredient[]> {
		const allIngredients = await this.getAllIngredients();
		return allIngredients.filter(ingredient => ingredient.category?.toLowerCase() === category.toLowerCase());
	}
}

// Export singleton instance
export const ingredientsService = new IngredientsService();
