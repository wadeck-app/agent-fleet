import type { Product, ProductCategory, ProductStatus, ProductsListQuery } from '@app/shared/api/products.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * PRODUCTS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for products.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * ===========================================================================================
 */

export class ProductsRepository {
	constructor(private readonly base: BaseRepository<Product>) {}

	/**
	 * Find all products with optional filters and multi-column sorting
	 */
	async findAll(query?: ProductsListQuery): Promise<Product[]> {
		const qb = this.base.query();

		// Apply category filter
		if (query?.category) {
			qb.where('category', '=', query.category);
		}

		// Apply status filter
		if (query?.status) {
			qb.where('status', '=', query.status);
		}

		// Apply featured filter
		if (query?.featured !== undefined) {
			qb.where('featured', '=', query.featured);
		}

		// Apply price range filters
		if (query?.minPrice !== undefined) {
			qb.where('price', '>=', query.minPrice);
		}

		if (query?.maxPrice !== undefined) {
			qb.where('price', '<=', query.maxPrice);
		}

		// Apply multi-column sorting
		// Format: sortBy="name,price" sortOrder="asc,desc"
		if (query?.sortBy && query?.sortOrder) {
			const sortColumns = query.sortBy.split(',').map(s => s.trim());
			const sortOrders = query.sortOrder.split(',').map(s => s.trim().toUpperCase() as 'ASC' | 'DESC');

			// Apply each sort in order (first has priority)
			sortColumns.forEach((column, index) => {
				const order = sortOrders[index] || 'ASC';
				if (index === 0) {
					qb.orderBy(column as keyof Product, order);
				} else {
					qb.thenBy(column as keyof Product, order);
				}
			});
		}

		// Get results
		let results = await qb.execute();

		// Apply search filter (name or description contains search term)
		// Note: For in-memory, we filter after fetch. For SQL, this would be a WHERE clause
		if (query?.search) {
			const searchLower = query.search.toLowerCase();
			results = results.filter(
				p => p.name.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower)
			);
		}

		return results;
	}

	/**
	 * Find product by ID
	 */
	async findById(id: string): Promise<Product | null> {
		return this.base.findById(id);
	}

	/**
	 * Find products by category
	 * @param category Product category
	 */
	async findByCategory(category: string): Promise<Product[]> {
		return this.base
			.query()
			.where('category', '=', category as ProductCategory)
			.execute();
	}

	/**
	 * Find products by status
	 * @param status Product status
	 */
	async findByStatus(status: string): Promise<Product[]> {
		return this.base
			.query()
			.where('status', '=', status as ProductStatus)
			.execute();
	}

	/**
	 * Find featured products
	 */
	async findFeatured(): Promise<Product[]> {
		return this.base.query().where('featured', '=', true).execute();
	}

	/**
	 * Create a new product
	 */
	async create(data: Omit<Product, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Product> {
		return this.base.create(data);
	}

	/**
	 * Update an existing product
	 */
	async update(id: string, data: Partial<Omit<Product, 'id' | 'createdAt'>>): Promise<Product> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a product
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}
}
