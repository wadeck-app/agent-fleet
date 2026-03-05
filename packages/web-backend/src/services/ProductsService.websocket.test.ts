import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateProduct, Product, UpdateProduct } from '@app/shared/api/products.contract';

import { BaseRepository } from '../repositories/BaseRepository';
import { ProductsRepository } from '../repositories/ProductsRepository';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { ProductsService } from './ProductsService';
import type { ProductEvent } from './ProductsWebSocketService';
import { ProductsWebSocketService } from './ProductsWebSocketService';

/**
 * Integration tests for ProductsService WebSocket broadcasting
 */
describe('ProductsService WebSocket Integration', () => {
	let service: ProductsService;
	let wsService: ProductsWebSocketService;
	let storage: InMemoryStorage;

	beforeEach(() => {
		// Reset WebSocket service
		ProductsWebSocketService.resetInstance();
		wsService = ProductsWebSocketService.getInstance();

		// Create repository with in-memory storage
		storage = new InMemoryStorage();
		const baseRepo = new BaseRepository<Product>('products', storage);
		const repo = new ProductsRepository(baseRepo);

		// Create service
		service = new ProductsService(repo);

		// Spy on broadcast method
		vi.spyOn(wsService, 'broadcast');
	});

	afterEach(() => {
		ProductsWebSocketService.resetInstance();
		vi.restoreAllMocks();
	});

	describe('Create product', () => {
		it('should broadcast product:created event after creating product', async () => {
			const createData: CreateProduct = {
				name: 'Test Product',
				description: 'Test Description',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const product = await service.create(createData);

			expect(wsService.broadcast).toHaveBeenCalledTimes(1);
			expect(wsService.broadcast).toHaveBeenCalledWith({
				type: 'product:created',
				product: expect.objectContaining({
					id: product.id,
					name: 'Test Product',
					category: 'electronics',
				}),
			});
		});
	});

	describe('Update product', () => {
		it('should broadcast product:updated event after updating product', async () => {
			const createData: CreateProduct = {
				name: 'Original Product',
				description: 'Original Description',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const created = await service.create(createData);

			// Clear the broadcast spy after creation
			vi.clearAllMocks();

			const updateData: UpdateProduct = {
				name: 'Updated Product',
				description: 'Updated Description',
				category: 'clothing',
				price: 79.99,
				stock: 5,
				status: 'active',
				rating: 4.0,
				featured: false,
				version: created.version,
			};

			const updated = await service.update(created.id, updateData);

			expect(wsService.broadcast).toHaveBeenCalledTimes(1);
			expect(wsService.broadcast).toHaveBeenCalledWith({
				type: 'product:updated',
				product: expect.objectContaining({
					id: updated.id,
					name: 'Updated Product',
					category: 'clothing',
					version: created.version + 1,
				}),
			});
		});
	});

	describe('Delete product', () => {
		it('should broadcast product:deleted event after deleting product', async () => {
			const createData: CreateProduct = {
				name: 'Product to Delete',
				description: 'Will be deleted',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const created = await service.create(createData);

			// Clear the broadcast spy after creation
			vi.clearAllMocks();

			await service.delete(created.id);

			expect(wsService.broadcast).toHaveBeenCalledTimes(1);
			expect(wsService.broadcast).toHaveBeenCalledWith({
				type: 'product:deleted',
				id: created.id,
			});
		});
	});

	describe('Bulk delete products', () => {
		it('should broadcast product:deleted event for each successfully deleted product', async () => {
			const createData1: CreateProduct = {
				name: 'Product 1',
				description: 'Description 1',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const createData2: CreateProduct = {
				name: 'Product 2',
				description: 'Description 2',
				category: 'clothing',
				price: 49.99,
				stock: 5,
				status: 'active',
				rating: 4.0,
				featured: false,
			};

			const product1 = await service.create(createData1);
			const product2 = await service.create(createData2);

			// Clear the broadcast spy after creation
			vi.clearAllMocks();

			const result = await service.bulkDelete([product1.id, product2.id]);

			expect(result.totalDeleted).toBe(2);
			expect(result.totalFailed).toBe(0);

			expect(wsService.broadcast).toHaveBeenCalledTimes(2);
			expect(wsService.broadcast).toHaveBeenNthCalledWith(1, {
				type: 'product:deleted',
				id: product1.id,
			});
			expect(wsService.broadcast).toHaveBeenNthCalledWith(2, {
				type: 'product:deleted',
				id: product2.id,
			});
		});

		it('should not broadcast for failed deletions', async () => {
			const createData: CreateProduct = {
				name: 'Existing Product',
				description: 'Exists',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const product = await service.create(createData);

			// Clear the broadcast spy after creation
			vi.clearAllMocks();

			const result = await service.bulkDelete([product.id, 'non-existent-id']);

			expect(result.totalDeleted).toBe(1);
			expect(result.totalFailed).toBe(1);

			// Should only broadcast once for the successful deletion
			expect(wsService.broadcast).toHaveBeenCalledTimes(1);
			expect(wsService.broadcast).toHaveBeenCalledWith({
				type: 'product:deleted',
				id: product.id,
			});
		});
	});

	describe('Event payload structure', () => {
		it('should include complete product data in product:created event', async () => {
			const createData: CreateProduct = {
				name: 'Complete Product',
				description: 'Full Description',
				category: 'electronics',
				price: 149.99,
				stock: 20,
				status: 'active',
				rating: 5.0,
				featured: true,
				imageUrl: 'https://example.com/image.jpg',
			};

			await service.create(createData);

			const broadcastCall = (wsService.broadcast as any).mock.calls[0][0] as ProductEvent;

			expect(broadcastCall.type).toBe('product:created');
			if (broadcastCall.type === 'product:created') {
				expect(broadcastCall.product).toMatchObject({
					name: 'Complete Product',
					description: 'Full Description',
					category: 'electronics',
					price: 149.99,
					stock: 20,
					status: 'active',
					rating: 5.0,
					featured: true,
					imageUrl: 'https://example.com/image.jpg',
					version: 1,
				});
				expect(broadcastCall.product.id).toBeDefined();
				expect(broadcastCall.product.createdAt).toBeTypeOf('string');
				expect(broadcastCall.product.updatedAt).toBeTypeOf('string');
			}
		});

		it('should include updated product data in product:updated event', async () => {
			const createData: CreateProduct = {
				name: 'Original',
				description: 'Original Description',
				category: 'electronics',
				price: 99.99,
				stock: 10,
				status: 'active',
				rating: 4.5,
				featured: true,
			};

			const created = await service.create(createData);
			vi.clearAllMocks();

			const updateData: UpdateProduct = {
				name: 'Updated',
				description: 'Updated Description',
				category: 'clothing',
				price: 79.99,
				stock: 5,
				status: 'draft',
				rating: 3.5,
				featured: false,
				version: created.version,
			};

			await service.update(created.id, updateData);

			const broadcastCall = (wsService.broadcast as any).mock.calls[0][0] as ProductEvent;

			expect(broadcastCall.type).toBe('product:updated');
			if (broadcastCall.type === 'product:updated') {
				expect(broadcastCall.product).toMatchObject({
					id: created.id,
					name: 'Updated',
					description: 'Updated Description',
					category: 'clothing',
					price: 79.99,
					stock: 5,
					status: 'draft',
					rating: 3.5,
					featured: false,
					version: created.version + 1,
				});
			}
		});
	});
});
