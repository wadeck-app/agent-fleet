import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Product, ProductsListQuery } from '@app/shared/api/products.contract';

import type { QueryBuilder } from '../storage/QueryBuilder';
import type { BaseRepository } from './BaseRepository';
import { ProductsRepository } from './ProductsRepository';

/**
 * ===========================================================================================
 * PRODUCTS REPOSITORY TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock BaseRepository (unit test - no real storage)
 * - Test domain-specific query methods
 * - Test filter composition (search, category, status, featured, price range)
 * - Test delegation to BaseRepository
 *
 * ===========================================================================================
 */

describe('ProductsRepository', () => {
	let repository: ProductsRepository;
	let mockBaseRepository: BaseRepository<Product>;
	let mockQueryBuilder: QueryBuilder<Product>;

	// Sample test data
	const sampleProduct: Product = {
		id: '1',
		name: 'Laptop Pro',
		description: 'High-performance laptop for professionals',
		category: 'electronics',
		price: 1299.99,
		stock: 50,
		status: 'active',
		rating: 4.5,
		imageUrl: 'https://example.com/laptop.jpg',
		featured: true,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	const anotherProduct: Product = {
		id: '2',
		name: 'Gaming Mouse',
		description: 'Ergonomic gaming mouse with RGB lighting',
		category: 'electronics',
		price: 79.99,
		stock: 200,
		status: 'active',
		rating: 4.8,
		imageUrl: 'https://example.com/mouse.jpg',
		featured: false,
		version: 1,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
	};

	const draftProduct: Product = {
		id: '3',
		name: 'T-Shirt',
		description: 'Cotton t-shirt',
		category: 'clothing',
		price: 19.99,
		stock: 100,
		status: 'draft',
		rating: 0,
		featured: false,
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
			thenBy: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		} as unknown as QueryBuilder<Product>;

		// Create mock base repository
		mockBaseRepository = {
			query: vi.fn().mockReturnValue(mockQueryBuilder),
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as BaseRepository<Product>;

		// Create repository with mock base
		repository = new ProductsRepository(mockBaseRepository);
	});

	describe('findAll - Find all products with filters', () => {
		it('should return all products when no filters provided', async () => {
			const products = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(products);

			const result = await repository.findAll();

			expect(result).toEqual(products);
			expect(mockBaseRepository.query).toHaveBeenCalled();
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (name or description)', async () => {
			const query: ProductsListQuery = { search: 'Laptop' };
			const allProducts = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allProducts);

			const result = await repository.findAll(query);

			// Should filter client-side for search
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleProduct);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by search term (case-insensitive)', async () => {
			const query: ProductsListQuery = { search: 'LAPTOP' };
			const allProducts = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allProducts);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(sampleProduct);
		});

		it('should filter by search in description field', async () => {
			const query: ProductsListQuery = { search: 'gaming' };
			const allProducts = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allProducts);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherProduct);
		});

		it('should filter by category (using query builder)', async () => {
			const query: ProductsListQuery = { category: 'electronics' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'electronics');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by status (using query builder)', async () => {
			const query: ProductsListQuery = { status: 'active' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('status', '=', 'active');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by featured flag (true)', async () => {
			const query: ProductsListQuery = { featured: true };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('featured', '=', true);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by featured flag (false)', async () => {
			const query: ProductsListQuery = { featured: false };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherProduct, draftProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([anotherProduct, draftProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('featured', '=', false);
		});

		it('should filter by minimum price', async () => {
			const query: ProductsListQuery = { minPrice: 50 };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('price', '>=', 50);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by maximum price', async () => {
			const query: ProductsListQuery = { maxPrice: 100 };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherProduct, draftProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([anotherProduct, draftProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('price', '<=', 100);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should filter by price range', async () => {
			const query: ProductsListQuery = { minPrice: 20, maxPrice: 100 };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('price', '>=', 20);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('price', '<=', 100);
		});

		it('should combine category and status filters', async () => {
			const query: ProductsListQuery = { category: 'electronics', status: 'active' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findAll(query);

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'electronics');
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('status', '=', 'active');
		});

		it('should return empty array when no matches found', async () => {
			const query: ProductsListQuery = { search: 'NonExistent' };
			const allProducts = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allProducts);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(0);
		});

		it('should return all products when search is empty string', async () => {
			const query: ProductsListQuery = { search: '' };
			const allProducts = [sampleProduct, anotherProduct];
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue(allProducts);

			const result = await repository.findAll(query);

			expect(result).toHaveLength(2);
			expect(result).toEqual(allProducts);
		});

		it('should apply single-column sort', async () => {
			const query: ProductsListQuery = { sortBy: 'name', sortOrder: 'asc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([anotherProduct, sampleProduct]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('name', 'ASC');
			expect(mockQueryBuilder.thenBy).not.toHaveBeenCalled();
		});

		it('should apply multi-column sort with orderBy and thenBy', async () => {
			const query: ProductsListQuery = { sortBy: 'category,price', sortOrder: 'asc,desc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('category', 'ASC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('price', 'DESC');
		});

		it('should apply multi-column sort with default ASC order for missing sort orders', async () => {
			const query: ProductsListQuery = { sortBy: 'category,name,price', sortOrder: 'desc' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			await repository.findAll(query);

			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('category', 'DESC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('name', 'ASC');
			expect(mockQueryBuilder.thenBy).toHaveBeenCalledWith('price', 'ASC');
		});

		it('should combine search with category filter', async () => {
			const query: ProductsListQuery = { search: 'Mouse', category: 'electronics' };
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findAll(query);

			// Search is applied client-side AFTER query builder filters
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(anotherProduct);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'electronics');
		});
	});

	describe('findById - Find product by ID', () => {
		it('should return product when found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(sampleProduct);

			const result = await repository.findById('1');

			expect(result).toEqual(sampleProduct);
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should return null when not found', async () => {
			vi.mocked(mockBaseRepository.findById).mockResolvedValue(null);

			const result = await repository.findById('999');

			expect(result).toBeNull();
			expect(mockBaseRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('findByCategory - Find products by category', () => {
		it('should find products by category', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findByCategory('electronics');

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('category', '=', 'electronics');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when category not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByCategory('unknown');

			expect(result).toEqual([]);
		});
	});

	describe('findByStatus - Find products by status', () => {
		it('should find products by status', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct, anotherProduct]);

			const result = await repository.findByStatus('active');

			expect(result).toEqual([sampleProduct, anotherProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('status', '=', 'active');
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when status not found', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findByStatus('archived');

			expect(result).toEqual([]);
		});
	});

	describe('findFeatured - Find featured products', () => {
		it('should find featured products', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([sampleProduct]);

			const result = await repository.findFeatured();

			expect(result).toEqual([sampleProduct]);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith('featured', '=', true);
			expect(mockQueryBuilder.execute).toHaveBeenCalled();
		});

		it('should return empty array when no featured products', async () => {
			vi.mocked(mockQueryBuilder.execute).mockResolvedValue([]);

			const result = await repository.findFeatured();

			expect(result).toEqual([]);
		});
	});

	describe('create - Create a new product', () => {
		it('should create a product', async () => {
			const createData = {
				name: 'New Product',
				description: 'New product description',
				category: 'electronics' as const,
				price: 99.99,
				stock: 50,
				status: 'active' as const,
				rating: 4.0,
				featured: false,
			};

			const createdProduct: Product = {
				...createData,
				id: '4',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.create).mockResolvedValue(createdProduct);

			const result = await repository.create(createData);

			expect(result).toEqual(createdProduct);
			expect(mockBaseRepository.create).toHaveBeenCalledWith(createData);
		});
	});

	describe('update - Update an existing product', () => {
		it('should update a product', async () => {
			const updateData = {
				name: 'Updated Name',
				version: 2,
			};

			const updatedProduct: Product = {
				...sampleProduct,
				...updateData,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockBaseRepository.update).mockResolvedValue(updatedProduct);

			const result = await repository.update('1', updateData);

			expect(result).toEqual(updatedProduct);
			expect(mockBaseRepository.update).toHaveBeenCalledWith('1', updateData);
		});
	});

	describe('delete - Delete a product', () => {
		it('should delete a product', async () => {
			vi.mocked(mockBaseRepository.delete).mockResolvedValue(undefined);

			await repository.delete('1');

			expect(mockBaseRepository.delete).toHaveBeenCalledWith('1');
		});
	});
});
