import type {
	BulkDeleteResponse,
	CreateIngredient,
	FailedDeletion,
	Ingredient,
	IngredientListResponse,
	IngredientsListQuery,
	PatchIngredient,
	UpdateIngredient,
} from '@app/shared/api/ingredients.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { IngredientsRepository } from '../repositories/IngredientsRepository';

/**
 * ===========================================================================================
 * INGREDIENTS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for ingredients.
 * Responsibilities:
 * - Pagination
 * - Optimistic locking (version management)
 * - Business validation
 * - Search/filter orchestration
 *
 * ===========================================================================================
 */

export class IngredientsService {
	constructor(private readonly repository: IngredientsRepository) {}

	/**
	 * List ingredients with pagination and filters
	 */
	async list(query: IngredientsListQuery): Promise<IngredientListResponse> {
		// Get filtered results
		let items = await this.repository.findAll(query);

		// Pagination with safe defaults
		const DEFAULT_PAGE_SIZE = 10;
		const MAX_PAGE_SIZE = 100;

		// Normalize page (handle 0 or negative as page 1)
		const page = Math.max(query.page || 1, 1);

		// Normalize pageSize (handle negative, zero, or undefined by using default)
		const requestedPageSize =
			query.pageSize !== undefined && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;
		const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

		const total = items.length;
		const totalPages = Math.ceil(total / pageSize);

		// Slice for current page
		const start = (page - 1) * pageSize;
		const end = start + pageSize;
		items = items.slice(start, end);

		return {
			items,
			pagination: {
				total,
				page,
				pageSize,
				totalPages,
			},
		};
	}

	/**
	 * Get ingredient by ID
	 */
	async getById(id: string): Promise<Ingredient> {
		const ingredient = await this.repository.findById(id);
		if (!ingredient) {
			throw new NotFoundException(`Ingredient with id ${id} not found`, ERROR_CODES.INGREDIENT_NOT_FOUND);
		}
		return ingredient;
	}

	/**
	 * Create a new ingredient
	 */
	async create(data: CreateIngredient): Promise<Ingredient> {
		// Business validation
		this.validateIngredientData(data);

		// Create via repository
		return this.repository.create(data);
	}

	/**
	 * Update an existing ingredient (with optimistic locking)
	 */
	async update(id: string, data: UpdateIngredient): Promise<Ingredient> {
		// Get current entity
		const current = await this.getById(id);

		// Optimistic locking check
		if (current.version !== data.version) {
			throw new ConflictException(
				`Ingredient has been modified by another user. Expected version ${data.version}, but current version is ${current.version}.`,
				ERROR_CODES.VERSION_MISMATCH,
				{ expectedVersion: data.version, currentVersion: current.version }
			);
		}

		// Business validation
		if (Object.keys(data).length > 1) {
			// More than just version
			this.validateIngredientData(data as Partial<CreateIngredient>);
		}

		// Update via repository (increment version)
		const updated = await this.repository.update(id, {
			...data,
			version: current.version + 1,
		});

		return updated;
	}

	/**
	 * Partially update an ingredient (merge changes with version check)
	 * Similar to update() but accepts all optional fields (except version)
	 */
	async partialUpdate(id: string, partialData: PatchIngredient): Promise<Ingredient> {
		// 1. Get current entity (throws NotFoundException if not found)
		const current = await this.getById(id);

		// 2. Optimistic locking check (SAME as update())
		if (current.version !== partialData.version) {
			throw new ConflictException(
				`Ingredient has been modified by another user. Expected version ${partialData.version}, but current version is ${current.version}.`,
				ERROR_CODES.VERSION_MISMATCH,
				{ expectedVersion: partialData.version, currentVersion: current.version }
			);
		}

		// 3. Business validation (if there are fields beyond version)
		if (Object.keys(partialData).length > 1) {
			// More than just version
			this.validateIngredientData(partialData as Partial<CreateIngredient>);
		}

		// 4. Update via repository (increment version)
		const updated = await this.repository.update(id, {
			...partialData,
			version: current.version + 1,
		});

		return updated;
	}

	/**
	 * Delete an ingredient
	 */
	async delete(id: string): Promise<void> {
		// Check if exists
		await this.getById(id);

		// Delete via repository
		await this.repository.delete(id);
	}

	/**
	 * Delete multiple ingredients (best-effort approach)
	 * Returns detailed results for each ID
	 */
	async bulkDelete(ids: string[]): Promise<BulkDeleteResponse> {
		const deleted: string[] = [];
		const failed: FailedDeletion[] = [];

		for (const id of ids) {
			try {
				// Validate ingredient exists (throws NotFoundException if not)
				await this.getById(id);

				// Delete via repository
				await this.repository.delete(id);

				deleted.push(id);
			} catch (error) {
				// Collect failure information
				if (error instanceof NotFoundException) {
					failed.push({
						id,
						reason: `Ingredient with id ${id} not found`,
						code: ERROR_CODES.INGREDIENT_NOT_FOUND,
					});
				} else {
					failed.push({
						id,
						reason: error instanceof Error ? error.message : 'Unknown error',
						code: ERROR_CODES.INTERNAL_SERVER_ERROR,
					});
				}
			}
		}

		return {
			success: true,
			deleted,
			failed,
			totalRequested: ids.length,
			totalDeleted: deleted.length,
			totalFailed: failed.length,
		};
	}

	/**
	 * Business validation for ingredient data
	 * (Beyond schema validation done by Zod)
	 */
	private validateIngredientData(data: Partial<CreateIngredient>): void {
		// Example: Ensure macros add up reasonably
		if (data.protein !== undefined && data.carbs !== undefined && data.fat !== undefined) {
			const calculatedCalories = data.protein * 4 + data.carbs * 4 + data.fat * 9;
			const declaredCalories = data.calories ?? 0;

			// Allow 10% margin of error
			if (Math.abs(calculatedCalories - declaredCalories) > declaredCalories * 0.1) {
				console.warn(
					`Calories mismatch: calculated ${calculatedCalories} vs declared ${declaredCalories}. Proceeding anyway.`
				);
			}
		}
	}
}
