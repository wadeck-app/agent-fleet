/**
 * MockTransportClient Tests
 *
 * Tests for the mock transport client including:
 * - Request/response mocking
 * - Event emission
 * - Request history tracking
 * - Connection state simulation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MockTransportClient } from './MockTransportClient';

describe('MockTransportClient', () => {
	let client: MockTransportClient;

	beforeEach(() => {
		client = new MockTransportClient();
	});

	describe('connection management', () => {
		it('should start disconnected', () => {
			expect(client.isConnected()).toBe(false);
		});

		it('should connect successfully', async () => {
			await client.connect();
			expect(client.isConnected()).toBe(true);
		});

		it('should disconnect successfully', async () => {
			await client.connect();
			await client.disconnect();
			expect(client.isConnected()).toBe(false);
		});

		it('should emit connection state changes', async () => {
			const handler = vi.fn();
			client.onConnectionStateChange(handler);

			await client.connect();
			expect(handler).toHaveBeenCalledWith('connecting');
			expect(handler).toHaveBeenCalledWith('connected');

			await client.disconnect();
			expect(handler).toHaveBeenCalledWith('disconnected');
		});
	});

	describe('request handling', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should return empty object by default', async () => {
			const result = await client.request('GET', '/api/tasks/');
			expect(result).toEqual({});
		});

		it('should return mocked response', async () => {
			const mockData = [{ id: '1', description: 'Task 1' }];
			client.mockResponse('GET', '/api/tasks/', { body: mockData });

			const result = await client.request('GET', '/api/tasks/');
			expect(result).toEqual(mockData);
		});

		it('should handle POST requests', async () => {
			const mockTask = { id: '2', description: 'New task' };
			client.mockResponse('POST', '/api/tasks/', { body: mockTask });

			const result = await client.request('POST', '/api/tasks/', {
				body: { description: 'New task' },
			});

			expect(result).toEqual(mockTask);
		});

		it('should throw error when mocked', async () => {
			client.mockResponse('POST', '/api/tasks/', {
				error: {
					code: 'VALIDATION_ERROR',
					message: 'Description is required',
				},
			});

			await expect(client.request('POST', '/api/tasks/' as any, { body: {} } as any)).rejects.toEqual({
				code: 'VALIDATION_ERROR',
				message: 'Description is required',
			});
		});

		it('should respect mock delay', async () => {
			vi.useFakeTimers();

			client.mockResponse('GET', '/api/tasks/', {
				body: [{ id: '1' }],
				delay: 100,
			});

			const promise = client.request('GET', '/api/tasks/' as any);

			await vi.advanceTimersByTimeAsync(50);
			expect(promise).toBeInstanceOf(Promise);

			await vi.advanceTimersByTimeAsync(60);
			const result = await promise;
			expect(result).toEqual([{ id: '1' }]);

			vi.useRealTimers();
		});

		it('should respect default delay', async () => {
			vi.useFakeTimers();

			client.setDefaultDelay(50);
			client.mockResponse('GET', '/api/tasks/', { body: [{ id: '1' }] });

			const promise = client.request('GET', '/api/tasks/' as any);

			await vi.advanceTimersByTimeAsync(40);
			expect(promise).toBeInstanceOf(Promise);

			await vi.advanceTimersByTimeAsync(20);
			const result = await promise;
			expect(result).toEqual([{ id: '1' }]);

			vi.useRealTimers();
		});
	});

	describe('request history', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should record requests', async () => {
			await client.request('GET', '/api/tasks/' as any);
			await client.request(
				'POST',
				'/api/tasks/' as any,
				{
					body: { description: 'Task' },
				} as any
			);

			const history = client.getRequestHistory();
			expect(history).toHaveLength(2);
			expect(history[0].method).toBe('GET');
			expect(history[1].method).toBe('POST');
		});

		it('should get last request', async () => {
			await client.request('GET', '/api/tasks/' as any);
			await client.request(
				'POST',
				'/api/tasks/' as any,
				{
					body: { description: 'Task' },
				} as any
			);

			const lastRequest = client.getLastRequest();
			expect(lastRequest?.method).toBe('POST');
			expect(lastRequest?.body).toEqual({ description: 'Task' });
		});

		it('should find requests by method', async () => {
			await client.request('GET', '/api/tasks/' as any);
			await client.request('POST', '/api/tasks/' as any);
			await client.request('GET', '/api/workers/' as any);

			const getRequests = client.findRequests('GET');
			expect(getRequests).toHaveLength(2);
			expect(getRequests[0].path).toBe('/api/tasks/');
			expect(getRequests[1].path).toBe('/api/workers/');
		});

		it('should find requests by method and path', async () => {
			await client.request('GET', '/api/tasks/' as any);
			await client.request('POST', '/api/tasks/' as any);
			await client.request('GET', '/api/workers/' as any);

			const taskGetRequests = client.findRequests('GET', '/api/tasks/');
			expect(taskGetRequests).toHaveLength(1);
			expect(taskGetRequests[0].path).toBe('/api/tasks/');
		});

		it('should clear request history', async () => {
			await client.request('GET', '/api/tasks/' as any);
			await client.request('POST', '/api/tasks/' as any);

			client.clearRequestHistory();
			expect(client.getRequestHistory()).toHaveLength(0);
		});

		it('should include request metadata', async () => {
			await client.request(
				'GET',
				'/api/tasks/:id' as any,
				{
					params: { id: '123' },
					query: { status: 'todo' },
					headers: { 'X-Custom': 'header' },
				} as any
			);

			const lastRequest = client.getLastRequest();
			expect(lastRequest?.params).toEqual({ id: '123' });
			expect(lastRequest?.query).toEqual({ status: 'todo' });
			expect(lastRequest?.headers).toEqual({ 'X-Custom': 'header' });
			expect(lastRequest?.timestamp).toBeGreaterThan(0);
		});
	});

	describe('event handling', () => {
		it('should subscribe and emit events', () => {
			const handler = vi.fn();
			client.subscribe('task:created' as any, handler);

			const taskData = { id: '1', description: 'New task' };
			client.emit('task:created' as any, taskData);

			expect(handler).toHaveBeenCalledWith(taskData);
		});

		it('should support multiple subscribers', () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			client.subscribe('task:created' as any, handler1);
			client.subscribe('task:created' as any, handler2);

			const taskData = { id: '1', description: 'New task' };
			client.emit('task:created' as any, taskData);

			expect(handler1).toHaveBeenCalledWith(taskData);
			expect(handler2).toHaveBeenCalledWith(taskData);
		});

		it('should unsubscribe correctly', () => {
			const handler = vi.fn();
			const unsubscribe = client.subscribe('task:created' as any, handler);

			unsubscribe();

			client.emit('task:created' as any, { id: '1' });
			expect(handler).not.toHaveBeenCalled();
		});

		it('should support multiple event types', () => {
			const taskHandler = vi.fn();
			const workerHandler = vi.fn();

			client.subscribe('task:created' as any, taskHandler);
			client.subscribe('worker:heartbeat' as any, workerHandler);

			client.emit('task:created' as any, { id: '1' });
			client.emit('worker:heartbeat' as any, { workerId: 'w1' });

			expect(taskHandler).toHaveBeenCalledWith({ id: '1' });
			expect(workerHandler).toHaveBeenCalledWith({ workerId: 'w1' });
		});
	});

	describe('mock management', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should clear individual mock response', async () => {
			client.mockResponse('GET', '/api/tasks/', { body: [{ id: '1' }] });
			client.clearMockResponse('GET', '/api/tasks/');

			const result = await client.request('GET', '/api/tasks/' as any);
			expect(result).toEqual({}); // Default response
		});

		it('should clear all mock responses', async () => {
			client.mockResponse('GET', '/api/tasks/', { body: [{ id: '1' }] });
			client.mockResponse('GET', '/api/workers/', { body: [{ id: 'w1' }] });

			client.clearAllMockResponses();

			const result1 = await client.request('GET', '/api/tasks/' as any);
			const result2 = await client.request('GET', '/api/workers/' as any);

			expect(result1).toEqual({});
			expect(result2).toEqual({});
		});
	});

	describe('connection state simulation', () => {
		it('should simulate connection state changes', () => {
			const handler = vi.fn();
			client.onConnectionStateChange(handler);

			client.simulateConnectionState('reconnecting');
			expect(handler).toHaveBeenCalledWith('reconnecting');

			client.simulateConnectionState('connected');
			expect(handler).toHaveBeenCalledWith('connected');

			client.simulateConnectionState('error');
			expect(handler).toHaveBeenCalledWith('error');
		});
	});

	describe('transport type', () => {
		it('should return mock transport type', () => {
			expect(client.getTransportType()).toBe('mock');
		});
	});
});
