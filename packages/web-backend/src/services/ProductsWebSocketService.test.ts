import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Product } from '@app/shared/api/products.contract';

import type { ProductEvent } from './ProductsWebSocketService';
import { ProductsWebSocketService } from './ProductsWebSocketService';

/**
 * Mock WebSocket class for testing
 */
class MockWebSocket extends EventEmitter {
	public readyState: number;
	public OPEN = 1;
	public CLOSED = 3;
	public sentMessages: string[] = [];

	constructor() {
		super();
		this.readyState = this.OPEN;
	}

	send(message: string): void {
		this.sentMessages.push(message);
	}

	close(): void {
		this.readyState = this.CLOSED;
		this.emit('close');
	}

	terminate(): void {
		this.readyState = this.CLOSED;
		this.emit('close');
	}
}

describe('ProductsWebSocketService', () => {
	let service: ProductsWebSocketService;

	beforeEach(() => {
		// Reset singleton before each test
		ProductsWebSocketService.resetInstance();
		service = ProductsWebSocketService.getInstance();
	});

	afterEach(() => {
		// Clean up after each test
		ProductsWebSocketService.resetInstance();
		vi.restoreAllMocks();
	});

	describe('Singleton pattern', () => {
		it('should return the same instance', () => {
			const instance1 = ProductsWebSocketService.getInstance();
			const instance2 = ProductsWebSocketService.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should reset instance correctly', () => {
			const instance1 = ProductsWebSocketService.getInstance();
			ProductsWebSocketService.resetInstance();
			const instance2 = ProductsWebSocketService.getInstance();

			expect(instance1).not.toBe(instance2);
		});
	});

	describe('Connection management', () => {
		it('should add connection and track count', () => {
			const ws = new MockWebSocket() as any;

			service.addConnection(ws);

			expect(service.getConnectionCount()).toBe(1);
		});

		it('should remove connection when closed', () => {
			const ws = new MockWebSocket() as any;

			service.addConnection(ws);
			expect(service.getConnectionCount()).toBe(1);

			ws.close();

			expect(service.getConnectionCount()).toBe(0);
		});

		it('should handle multiple connections', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;
			const ws3 = new MockWebSocket() as any;

			service.addConnection(ws1);
			service.addConnection(ws2);
			service.addConnection(ws3);

			expect(service.getConnectionCount()).toBe(3);

			ws2.close();

			expect(service.getConnectionCount()).toBe(2);
		});
	});

	describe('Message handling', () => {
		it('should respond to ping with pong', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			ws.emit('message', Buffer.from(JSON.stringify({ type: 'ping' })));

			expect(ws.sentMessages).toHaveLength(1);
			const response = JSON.parse(ws.sentMessages[0]);
			expect(response.type).toBe('pong');
		});

		it('should handle invalid JSON gracefully', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			ws.emit('message', Buffer.from('invalid json'));

			expect(ws.sentMessages).toHaveLength(1);
			const response = JSON.parse(ws.sentMessages[0]);
			expect(response.type).toBe('error');
			expect(response.message).toBe('Invalid message format');
		});

		it('should handle WebSocket errors', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			expect(service.getConnectionCount()).toBe(1);

			ws.emit('error', new Error('Connection error'));

			expect(service.getConnectionCount()).toBe(0);
		});
	});

	describe('Broadcasting', () => {
		const mockProduct: Product = {
			id: 'prod-1',
			name: 'Test Product',
			description: 'Test Description',
			category: 'electronics',
			price: 99.99,
			stock: 10,
			status: 'active',
			rating: 4.5,
			featured: true,
			version: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		it('should broadcast product:created event to all connections', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;

			service.addConnection(ws1);
			service.addConnection(ws2);

			const event: ProductEvent = {
				type: 'product:created',
				product: mockProduct,
			};

			service.broadcast(event);

			expect(ws1.sentMessages).toHaveLength(1);
			expect(ws2.sentMessages).toHaveLength(1);

			const message1 = JSON.parse(ws1.sentMessages[0]);
			expect(message1.type).toBe('product:created');
			expect(message1.product.id).toBe('prod-1');

			const message2 = JSON.parse(ws2.sentMessages[0]);
			expect(message2.type).toBe('product:created');
			expect(message2.product.id).toBe('prod-1');
		});

		it('should broadcast product:updated event', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			const event: ProductEvent = {
				type: 'product:updated',
				product: mockProduct,
			};

			service.broadcast(event);

			expect(ws.sentMessages).toHaveLength(1);
			const message = JSON.parse(ws.sentMessages[0]);
			expect(message.type).toBe('product:updated');
			expect(message.product.id).toBe('prod-1');
		});

		it('should broadcast product:deleted event', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			const event: ProductEvent = {
				type: 'product:deleted',
				id: 'prod-1',
			};

			service.broadcast(event);

			expect(ws.sentMessages).toHaveLength(1);
			const message = JSON.parse(ws.sentMessages[0]);
			expect(message.type).toBe('product:deleted');
			expect(message.id).toBe('prod-1');
		});

		it('should not broadcast to closed connections', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;

			service.addConnection(ws1);
			service.addConnection(ws2);

			ws1.readyState = ws1.CLOSED;

			const event: ProductEvent = {
				type: 'product:created',
				product: mockProduct,
			};

			service.broadcast(event);

			expect(ws1.sentMessages).toHaveLength(0);
			expect(ws2.sentMessages).toHaveLength(1);
			expect(service.getConnectionCount()).toBe(1);
		});

		it('should remove dead connections during broadcast', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;

			service.addConnection(ws1);
			service.addConnection(ws2);

			ws1.send = vi.fn(() => {
				throw new Error('Send failed');
			});

			const event: ProductEvent = {
				type: 'product:created',
				product: mockProduct,
			};

			service.broadcast(event);

			expect(service.getConnectionCount()).toBe(1);
			expect(ws2.sentMessages).toHaveLength(1);
		});
	});

	describe('Snapshot handling', () => {
		it('should send snapshot to specific client', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			const products: Product[] = [
				{
					id: 'prod-1',
					name: 'Product 1',
					description: 'Description 1',
					category: 'electronics',
					price: 99.99,
					stock: 10,
					status: 'active',
					rating: 4.5,
					featured: true,
					version: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					id: 'prod-2',
					name: 'Product 2',
					description: 'Description 2',
					category: 'clothing',
					price: 49.99,
					stock: 5,
					status: 'active',
					rating: 4.0,
					featured: false,
					version: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];

			service.sendSnapshot(ws, products);

			expect(ws.sentMessages).toHaveLength(1);
			const message = JSON.parse(ws.sentMessages[0]);
			expect(message.type).toBe('products:snapshot');
			expect(message.products).toHaveLength(2);
			expect(message.products[0].id).toBe('prod-1');
			expect(message.products[1].id).toBe('prod-2');
		});

		it('should send empty snapshot', () => {
			const ws = new MockWebSocket() as any;
			service.addConnection(ws);

			service.sendSnapshot(ws, []);

			expect(ws.sentMessages).toHaveLength(1);
			const message = JSON.parse(ws.sentMessages[0]);
			expect(message.type).toBe('products:snapshot');
			expect(message.products).toHaveLength(0);
		});
	});

	describe('Cleanup', () => {
		it('should close all connections', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;
			const ws3 = new MockWebSocket() as any;

			service.addConnection(ws1);
			service.addConnection(ws2);
			service.addConnection(ws3);

			expect(service.getConnectionCount()).toBe(3);

			service.closeAll();

			expect(service.getConnectionCount()).toBe(0);
		});

		it('should handle errors during close gracefully', () => {
			const ws1 = new MockWebSocket() as any;
			const ws2 = new MockWebSocket() as any;

			ws1.close = vi.fn(() => {
				throw new Error('Close failed');
			});

			service.addConnection(ws1);
			service.addConnection(ws2);

			expect(() => service.closeAll()).not.toThrow();

			expect(service.getConnectionCount()).toBe(0);
		});
	});
});
