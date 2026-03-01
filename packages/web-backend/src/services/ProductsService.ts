import type {
	CreateProduct,
	Product,
	ProductBulkDeleteResponse,
	ProductFailedDeletion,
	ProductListResponse,
	ProductsListQuery,
	UpdateProduct,
} from '@app/shared/api/products.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { ProductsRepository } from '../repositories/ProductsRepository';

/**
 * ===========================================================================================
 * PRODUCTS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for products.
 * Responsibilities:
 * - Pagination
 * - Optimistic locking (version management)
 * - Business validation
 * - Search/filter orchestration
 *
 * ===========================================================================================
 */

export class ProductsService {
	constructor(private readonly repository: ProductsRepository) {}

	/**
	 * List products with pagination and filters
	 */
	async list(query: ProductsListQuery): Promise<ProductListResponse> {
		// Get filtered results
		let items = await this.repository.findAll(query);

		// Pagination with sanitization
		// Ensure page is at least 1 (handle 0, negative, or undefined)
		const page = Math.max(query.page || 1, 1);
		// Ensure pageSize is between 1 and 100
		const pageSize = Math.min(Math.max(query.pageSize || 10, 1), 100);
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
	 * Get product by ID
	 */
	async getById(id: string): Promise<Product> {
		const product = await this.repository.findById(id);
		if (!product) {
			throw new NotFoundException(`Product with id ${id} not found`, ERROR_CODES.PRODUCT_NOT_FOUND);
		}
		return product;
	}

	/**
	 * Create a new product
	 */
	async create(data: CreateProduct): Promise<Product> {
		// Create via repository
		return this.repository.create(data);
	}

	/**
	 * Update an existing product (with optimistic locking)
	 */
	async update(id: string, data: UpdateProduct): Promise<Product> {
		// Get current entity
		const current = await this.getById(id);

		// Optimistic locking check
		if (current.version !== data.version) {
			throw new ConflictException(
				`Product has been modified by another user. Expected version ${data.version}, but current version is ${current.version}.`,
				ERROR_CODES.VERSION_MISMATCH,
				{ expectedVersion: data.version, currentVersion: current.version }
			);
		}

		// Update via repository (increment version)
		const updated = await this.repository.update(id, {
			...data,
			version: current.version + 1,
		});

		return updated;
	}

	/**
	 * Delete a product
	 */
	async delete(id: string): Promise<void> {
		// Check if exists
		await this.getById(id);

		// Delete via repository
		await this.repository.delete(id);
	}

	/**
	 * Delete multiple products (best-effort approach)
	 * Returns detailed results for each ID
	 */
	async bulkDelete(ids: string[]): Promise<ProductBulkDeleteResponse> {
		const deleted: string[] = [];
		const failed: ProductFailedDeletion[] = [];

		for (const id of ids) {
			try {
				// Validate product exists (throws NotFoundException if not)
				await this.getById(id);

				// Delete via repository
				await this.repository.delete(id);

				deleted.push(id);
			} catch (error) {
				// Collect failure information
				if (error instanceof NotFoundException) {
					failed.push({
						id,
						reason: `Product with id ${id} not found`,
						code: ERROR_CODES.PRODUCT_NOT_FOUND,
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
}
