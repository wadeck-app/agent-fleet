import { createValidator } from '@framework/utils/validation/validation';
import { required } from '@framework/utils/validation/validation';
import { maxLength } from '@framework/utils/validation/validation';
import { nonNegative } from '@framework/utils/validation/validation';
import { range } from '@framework/utils/validation/validation';
import { combine } from '@framework/utils/validation/validation';
import { type ValidationResult } from '@framework/utils/validation/validation';
import type {
	CreateProduct,
	Product,
	ProductBulkDeleteResponse,
	ProductListResponse,
	ProductsListQuery,
} from '@shared/api/products.contract';

import { productsApi } from './products.api';

/**
 * ===========================================================================================
 * PRODUCTS SERVICE - Business Logic Layer
 * ===========================================================================================
 *
 * Responsibilities:
 * - Encapsulate business logic and data transformations
 * - Coordinate multiple API calls if needed
 * - Provide higher-level operations
 * - Keep the business rules centralized
 * - Validate data using centralized validation library
 *
 * Pattern:
 * - Singleton service class
 * - Wraps API functions with business logic
 * - Provides validation using framework validators
 * - Exports singleton instance
 *
 * Usage:
 * ```tsx
 * const products = await productsService.getProducts({ page: 1, pageSize: 10 });
 * const validation = productsService.validateProductData(data);
 * const product = await productsService.createProduct(data);
 * ```
 *
 * ===========================================================================================
 */

export interface GetProductsParams {
	page?: number;
	pageSize?: number;
	sortBy?: string; // comma-separated column names
	sortOrder?: string; // comma-separated asc/desc
	search?: string; // Simple search query (omnisearch)
}

export class ProductsService {
	/**
	 * Centralized validation schema for product data
	 */
	private readonly productValidator = createValidator<CreateProduct>({
		name: combine(required('Name'), maxLength(200, 'Name')),
		description: combine(required('Description'), maxLength(2000, 'Description')),
		category: required('Category'),
		price: nonNegative('Price'),
		stock: nonNegative('Stock'),
		status: required('Status'),
		rating: range(0, 5, 'Rating'),
		// Boolean is always valid — no validation needed
		featured: () => null,
	});

	/**
	 * Get products with pagination and sorting
	 */
	async getProducts(params?: GetProductsParams): Promise<ProductListResponse> {
		const query: Partial<ProductsListQuery> = {};
		if (params?.page) query.page = params.page;
		if (params?.pageSize) query.pageSize = params.pageSize;
		if (params?.sortBy) query.sortBy = params.sortBy;
		if (params?.sortOrder) query.sortOrder = params.sortOrder;
		if (params?.search) query.search = params.search;

		return await productsApi.getAll(query as ProductsListQuery);
	}

	/**
	 * Get all products (legacy - use getProducts for pagination/sorting)
	 */
	async getAllProducts(): Promise<Product[]> {
		const response = await productsApi.getAll();
		return response.items;
	}

	/**
	 * Get a single product by ID
	 */
	async getProduct(id: string): Promise<Product> {
		return await productsApi.getById(id);
	}

	/**
	 * Validate product data using centralized validation library
	 */
	validateProductData(data: CreateProduct): ValidationResult {
		return this.productValidator(data);
	}

	/**
	 * Create a new product
	 */
	async createProduct(data: CreateProduct): Promise<Product> {
		// Validate before sending to API
		const validation = this.validateProductData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await productsApi.create(data);
	}

	/**
	 * Update an existing product
	 */
	async updateProduct(id: string, data: CreateProduct & { version: number }): Promise<Product> {
		// Validate before sending to API
		const validation = this.validateProductData(data);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
		}

		return await productsApi.update(id, data);
	}

	/**
	 * Delete a product
	 */
	async deleteProduct(id: string): Promise<void> {
		await productsApi.delete(id);
	}

	/**
	 * Bulk delete products
	 */
	async bulkDeleteProducts(ids: string[]): Promise<ProductBulkDeleteResponse> {
		return await productsApi.bulkDelete(ids);
	}

	/**
	 * Get products by category
	 * Example of a higher-level operation that could coordinate filtering
	 */
	async getProductsByCategory(category: string): Promise<Product[]> {
		const allProducts = await this.getAllProducts();
		return allProducts.filter(product => product.category === category);
	}

	/**
	 * Get products by status
	 */
	async getProductsByStatus(status: string): Promise<Product[]> {
		const allProducts = await this.getAllProducts();
		return allProducts.filter(product => product.status === status);
	}

	/**
	 * Get featured products
	 */
	async getFeaturedProducts(): Promise<Product[]> {
		const allProducts = await this.getAllProducts();
		return allProducts.filter(product => product.featured);
	}

	/**
	 * Calculate average rating for products
	 * Example of business logic that would live in the service layer
	 */
	calculateAverageRating(products: Product[]): number {
		if (products.length === 0) return 0;
		const totalRating = products.reduce((acc, product) => acc + product.rating, 0);
		return totalRating / products.length;
	}

	/**
	 * Calculate total inventory value
	 * Example of business logic
	 */
	calculateInventoryValue(products: Product[]): number {
		return products.reduce((acc, product) => acc + product.price * product.stock, 0);
	}
}

// Export singleton instance
export const productsService = new ProductsService();
