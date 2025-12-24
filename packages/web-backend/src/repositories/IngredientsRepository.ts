import type { Ingredient, IngredientsListQuery } from '@app/shared/api/ingredients.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * INGREDIENTS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for ingredients.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * ===========================================================================================
 */

export class IngredientsRepository {
	constructor(private readonly base: BaseRepository<Ingredient>) {}

	/**
	 * Find all ingredients with optional filters and multi-column sorting
	 */
	async findAll(query?: IngredientsListQuery): Promise<Ingredient[]> {
		const qb = this.base.query();

		// Apply category filter
		if (query?.category) {
			qb.where('category', '=', query.category);
		}

		// Apply multi-column sorting
		// Format: sortBy="name,calories" sortOrder="asc,desc"
		if (query?.sortBy && query?.sortOrder) {
			const sortColumns = query.sortBy.split(',').map(s => s.trim());
			const sortOrders = query.sortOrder.split(',').map(s => s.trim().toUpperCase() as 'ASC' | 'DESC');

			// Apply each sort in order (first has priority)
			sortColumns.forEach((column, index) => {
				const order = sortOrders[index] || 'ASC';
				if (index === 0) {
					qb.orderBy(column as keyof Ingredient, order);
				} else {
					qb.thenBy(column as keyof Ingredient, order);
				}
			});
		}

		// Get results
		let results = await qb.execute();

		// Apply search filter (name or category contains search term)
		// Note: For in-memory, we filter after fetch. For SQL, this would be a WHERE clause
		if (query?.search) {
			const searchLower = query.search.toLowerCase();
			results = results.filter(
				i => i.name.toLowerCase().includes(searchLower) || i.category?.toLowerCase().includes(searchLower)
			);
		}

		return results;
	}

	/**
	 * Find ingredient by ID
	 */
	async findById(id: string): Promise<Ingredient | null> {
		return this.base.findById(id);
	}

	/**
	 * Find ingredients by category
	 */
	async findByCategory(category: string): Promise<Ingredient[]> {
		return this.base.query().where('category', '=', category).execute();
	}

	/**
	 * Find high-protein ingredients
	 * @param minProtein Minimum protein value
	 */
	async findHighProtein(minProtein: number): Promise<Ingredient[]> {
		return this.base.query().where('protein', '>=', minProtein).orderBy('protein', 'DESC').execute();
	}

	/**
	 * Find low-calorie ingredients in a specific category
	 * @param category Food category
	 * @param maxCalories Maximum calories
	 */
	async findLowCalorieInCategory(category: string, maxCalories: number): Promise<Ingredient[]> {
		return this.base
			.query()
			.where('category', '=', category)
			.andWhere('calories', '<=', maxCalories)
			.orderBy('calories', 'ASC')
			.execute();
	}

	/**
	 * Create a new ingredient
	 */
	async create(data: Omit<Ingredient, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Ingredient> {
		return this.base.create(data);
	}

	/**
	 * Update an existing ingredient
	 */
	async update(id: string, data: Partial<Omit<Ingredient, 'id' | 'createdAt'>>): Promise<Ingredient> {
		return this.base.update(id, data);
	}

	/**
	 * Delete an ingredient
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}
}
