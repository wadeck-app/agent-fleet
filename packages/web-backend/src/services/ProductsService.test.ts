import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateProduct, Product, ProductsListQuery, UpdateProduct } from '@app/shared/api/products.contract';
import { ConflictException, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { ProductsRepository } from '../repositories/ProductsRepository';
import { ProductsService } from './ProductsService';

/**
 * ===========================================================================================
 * PRODUCTS SERVICE TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the ProductsRepository (unit test - no real dependencies)
 * - Test business logic: pagination, optimistic locking
 * - Test error handling (NotFoundException, ConflictException)
 * - Cover all edge cases
 *
 * ===========================================================================================
 */

describe('ProductsService', () => {
	let service: ProductsService;
	let mockRepository: ProductsRepository;

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

	beforeEach(() => {
		// Create mock repository
		mockRepository = {
			findAll: vi.fn(),
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		} as unknown as ProductsRepository;

		// Create service with mock repository
		service = new ProductsService(mockRepository);
	});

	describe('list - List products with pagination and filters', () => {
		it('should list all products with default pagination', async () => {
			const products = [sampleProduct, anotherProduct];
			vi.mocked(mockRepository.findAll).mockResolvedValue(products);

			const result = await service.list({});

			expect(result.items).toHaveLength(2);
			expect(result.items).toEqual(products);
			expect(result.pagination).toEqual({
				total: 2,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			});
			expect(mockRepository.findAll).toHaveBeenCalledWith({});
		});

		it('should paginate results correctly - page 1', async () => {
			const products = Array.from({ length: 15 }, (_, i) => ({
				...sampleProduct,
				id: String(i + 1),
				name: `Product ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(products);

			const result = await service.list({ page: 1, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('1');
			expect(result.items[4].id).toBe('5');
			expect(result.pagination).toEqual({
				total: 15,
				page: 1,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - page 2', async () => {
			const products = Array.from({ length: 15 }, (_, i) => ({
				...sampleProduct,
				id: String(i + 1),
				name: `Product ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(products);

			const result = await service.list({ page: 2, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('6');
			expect(result.items[4].id).toBe('10');
			expect(result.pagination).toEqual({
				total: 15,
				page: 2,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - last page with fewer items', async () => {
			const products = Array.from({ length: 15 }, (_, i) => ({
				...sampleProduct,
				id: String(i + 1),
				name: `Product ${i + 1}`,
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(products);

			const result = await service.list({ page: 3, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('11');
			expect(result.items[4].id).toBe('15');
			expect(result.pagination).toEqual({
				total: 15,
				page: 3,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should enforce maximum page size of 100', async () => {
			const products = Array.from({ length: 200 }, (_, i) => ({
				...sampleProduct,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(products);

			const result = await service.list({ page: 1, pageSize: 150 });

			// Should be capped at 100
			expect(result.items).toHaveLength(100);
			expect(result.pagination!.pageSize).toBe(100);
			expect(result.pagination!.totalPages).toBe(2);
		});

		it('should handle empty results', async () => {
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.list({});

			expect(result.items).toHaveLength(0);
			expect(result.pagination).toEqual({
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
			});
		});

		it('should pass search filter to repository', async () => {
			const query: ProductsListQuery = { search: 'Laptop' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleProduct]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass category filter to repository', async () => {
			const query: ProductsListQuery = { category: 'electronics' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleProduct, anotherProduct]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass status filter to repository', async () => {
			const query: ProductsListQuery = { status: 'active' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleProduct, anotherProduct]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass featured filter to repository', async () => {
			const query: ProductsListQuery = { featured: true };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleProduct]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should pass price range filters to repository', async () => {
			const query: ProductsListQuery = { minPrice: 50, maxPrice: 1500 };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleProduct, anotherProduct]);

			await service.list(query);

			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});
	});

	describe('getById - Get product by ID', () => {
		it('should return product when found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleProduct);

			const result = await service.getById('1');

			expect(result).toEqual(sampleProduct);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when product not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.getById('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
		});
	});

	describe('create - Create a new product', () => {
		const createData: CreateProduct = {
			name: 'New Product',
			description: 'New product description',
			category: 'electronics',
			price: 99.99,
			stock: 50,
			status: 'active',
			rating: 4.0,
			featured: false,
		};

		it('should create a product successfully', async () => {
			const createdProduct: Product = {
				...createData,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdProduct);

			const result = await service.create(createData);

			expect(result).toEqual(createdProduct);
			expect(mockRepository.create).toHaveBeenCalledWith(createData);
		});

		it('should create product with optional imageUrl', async () => {
			const dataWithImage: CreateProduct = {
				...createData,
				imageUrl: 'https://example.com/image.jpg',
			};

			const createdProduct: Product = {
				...dataWithImage,
				id: '3',
				version: 1,
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
			};

			vi.mocked(mockRepository.create).mockResolvedValue(createdProduct);

			const result = await service.create(dataWithImage);

			expect(result).toEqual(createdProduct);
			expect(mockRepository.create).toHaveBeenCalledWith(dataWithImage);
		});
	});

	describe('update - Update an existing product', () => {
		it('should update product successfully', async () => {
			const updateData: UpdateProduct = {
				name: 'Updated Name',
				description: 'Updated description',
				category: 'electronics',
				price: 1299.99,
				stock: 50,
				status: 'active',
				rating: 4.5,
				featured: true,
				version: 1,
			};

			const updatedProduct: Product = {
				...sampleProduct,
				name: 'Updated Name',
				description: 'Updated description',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleProduct);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedProduct);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedProduct);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.update).toHaveBeenCalledWith('1', {
				...updateData,
				version: 2,
			});
		});

		it('should throw NotFoundException when product not found', async () => {
			const updateData: UpdateProduct = {
				name: 'Updated Name',
				description: 'Updated description',
				category: 'electronics',
				price: 99.99,
				stock: 50,
				status: 'active',
				rating: 4.0,
				featured: false,
				version: 1,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.update('999', updateData)).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should throw ConflictException on version mismatch', async () => {
			const updateData: UpdateProduct = {
				name: 'Updated Name',
				description: 'Updated description',
				category: 'electronics',
				price: 1299.99,
				stock: 50,
				status: 'active',
				rating: 4.5,
				featured: true,
				version: 1,
			};

			const currentProduct: Product = {
				...sampleProduct,
				version: 2,
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(currentProduct);

			await expect(service.update('1', updateData)).rejects.toThrow(ConflictException);
			expect(mockRepository.update).not.toHaveBeenCalled();
		});

		it('should update product with imageUrl', async () => {
			const updateData: UpdateProduct = {
				name: 'Laptop Pro',
				description: 'High-performance laptop for professionals',
				category: 'electronics',
				price: 1299.99,
				stock: 50,
				status: 'active',
				rating: 4.5,
				imageUrl: 'https://example.com/new-image.jpg',
				featured: true,
				version: 1,
			};

			const updatedProduct: Product = {
				...sampleProduct,
				imageUrl: 'https://example.com/new-image.jpg',
				version: 2,
				updatedAt: '2024-01-02T00:00:00.000Z',
			};

			vi.mocked(mockRepository.findById).mockResolvedValue(sampleProduct);
			vi.mocked(mockRepository.update).mockResolvedValue(updatedProduct);

			const result = await service.update('1', updateData);

			expect(result).toEqual(updatedProduct);
			expect(mockRepository.update).toHaveBeenCalled();
		});
	});

	describe('delete - Delete a product', () => {
		it('should delete product successfully', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleProduct);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			await service.delete('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockRepository.delete).toHaveBeenCalledWith('1');
		});

		it('should throw NotFoundException when product not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			await expect(service.delete('999')).rejects.toThrow(NotFoundException);
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});
	});

	describe('bulkDelete - Delete multiple products', () => {
		it('should delete all products successfully', async () => {
			vi.mocked(mockRepository.findById)
				.mockResolvedValueOnce(sampleProduct)
				.mockResolvedValueOnce(anotherProduct);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1', '2']);

			expect(result).toEqual({
				success: true,
				deleted: ['1', '2'],
				failed: [],
				totalRequested: 2,
				totalDeleted: 2,
				totalFailed: 0,
			});
			expect(mockRepository.delete).toHaveBeenCalledTimes(2);
		});

		it('should handle partial failures', async () => {
			vi.mocked(mockRepository.findById)
				.mockResolvedValueOnce(sampleProduct)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(anotherProduct);
			vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

			const result = await service.bulkDelete(['1', '999', '2']);

			expect(result.success).toBe(true);
			expect(result.deleted).toEqual(['1', '2']);
			expect(result.failed).toHaveLength(1);
			expect(result.failed[0].id).toBe('999');
			expect(result.totalRequested).toBe(3);
			expect(result.totalDeleted).toBe(2);
			expect(result.totalFailed).toBe(1);
		});

		it('should handle all failures', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			const result = await service.bulkDelete(['999', '888']);

			expect(result).toEqual({
				success: true,
				deleted: [],
				failed: [
					{
						id: '999',
						reason: 'Product with id 999 not found',
						code: 'PRODUCT_NOT_FOUND',
					},
					{
						id: '888',
						reason: 'Product with id 888 not found',
						code: 'PRODUCT_NOT_FOUND',
					},
				],
				totalRequested: 2,
				totalDeleted: 0,
				totalFailed: 2,
			});
			expect(mockRepository.delete).not.toHaveBeenCalled();
		});

		it('should handle empty array', async () => {
			const result = await service.bulkDelete([]);

			expect(result).toEqual({
				success: true,
				deleted: [],
				failed: [],
				totalRequested: 0,
				totalDeleted: 0,
				totalFailed: 0,
			});
			expect(mockRepository.findById).not.toHaveBeenCalled();
		});
	});
});
