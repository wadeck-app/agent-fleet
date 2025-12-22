/**
 * RestTransportClient Tests
 *
 * Tests for the REST transport client including:
 * - HTTP request handling
 * - Cookie-based authentication
 * - Path parameter substitution
 * - Query parameter handling
 * - Error handling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RestTransportClient } from './RestTransportClient';

describe('RestTransportClient', () => {
	let client: RestTransportClient;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		client = new RestTransportClient({
			baseUrl: 'http://localhost:3000',
		});

		fetchMock = vi.fn();
		global.fetch = fetchMock as any;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('connection management', () => {
		it('should start disconnected', () => {
			expect(client.isConnected()).toBe(false);
		});

		it('should connect successfully', async () => {
			await client.connect();
			expect(client.isConnected()).toBe(true);
		});

		it('should fail to connect without base URL', async () => {
			const invalidClient = new RestTransportClient({} as any);
			await expect(invalidClient.connect()).rejects.toThrow('Base URL is required');
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

	describe('GET requests', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should make GET request', async () => {
			const mockData = [{ id: '1', description: 'Task 1' }];
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockData,
			});

			const result = await client.request('GET', '/api/tasks/' as any);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/',
				expect.objectContaining({
					method: 'GET',
					credentials: 'include',
				})
			);
			expect(result).toEqual(mockData);
		});

		it('should include query parameters', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			});

			await client.request(
				'GET',
				'/api/tasks/' as any,
				{
					query: { status: 'todo', priority: 'high' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/?status=todo&priority=high',
				expect.any(Object)
			);
		});

		it('should substitute path parameters', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: '123' }),
			});

			await client.request(
				'GET',
				'/api/tasks/:id' as any,
				{
					params: { id: '123' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/tasks/123', expect.any(Object));
		});

		it('should include custom headers', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			});

			await client.request(
				'GET',
				'/api/tasks/' as any,
				{
					headers: { 'X-Custom-Header': 'value' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/',
				expect.objectContaining({
					headers: expect.objectContaining({
						'X-Custom-Header': 'value',
					}),
				})
			);
		});
	});

	describe('POST requests', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should make POST request with body', async () => {
			const mockResponse = { id: '2', description: 'New task' };
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await client.request(
				'POST',
				'/api/tasks/' as any,
				{
					body: { description: 'New task', priority: 'high' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/',
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					body: JSON.stringify({ description: 'New task', priority: 'high' }),
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
					}),
				})
			);
			expect(result).toEqual(mockResponse);
		});
	});

	describe('PATCH requests', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should make PATCH request', async () => {
			const mockResponse = { id: '123', status: 'done' };
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await client.request(
				'PATCH',
				'/api/tasks/:id' as any,
				{
					params: { id: '123' },
					body: { status: 'done' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/123',
				expect.objectContaining({
					method: 'PATCH',
					credentials: 'include',
					body: JSON.stringify({ status: 'done' }),
				})
			);
			expect(result).toEqual(mockResponse);
		});
	});

	describe('DELETE requests', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should make DELETE request', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				status: 204,
			});

			const result = await client.request(
				'DELETE',
				'/api/tasks/:id' as any,
				{
					params: { id: '123' },
				} as any
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:3000/api/tasks/123',
				expect.objectContaining({
					method: 'DELETE',
					credentials: 'include',
				})
			);
			expect(result).toBeUndefined();
		});
	});

	describe('error handling', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should handle 404 errors', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				json: async () => ({
					code: 'NOT_FOUND',
					message: 'Task not found',
				}),
			});

			await expect(
				client.request(
					'GET',
					'/api/tasks/:id' as any,
					{
						params: { id: '999' },
					} as any
				)
			).rejects.toEqual({
				status: 404,
				code: 'NOT_FOUND',
				message: 'Task not found',
			});
		});

		it('should handle validation errors', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: 'Bad Request',
				json: async () => ({
					code: 'VALIDATION_ERROR',
					message: 'Description is required',
					details: { field: 'description' },
				}),
			});

			await expect(
				client.request(
					'POST',
					'/api/tasks/' as any,
					{
						body: {},
					} as any
				)
			).rejects.toEqual({
				status: 400,
				code: 'VALIDATION_ERROR',
				message: 'Description is required',
				details: { field: 'description' },
			});
		});

		it('should handle network errors', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Network error'));

			await expect(client.request('GET', '/api/tasks/' as any)).rejects.toEqual({
				status: 0,
				code: 'NETWORK_ERROR',
				message: 'Network error',
				details: expect.objectContaining({
					originalError: expect.any(Error),
				}),
			});
		});

		it('should handle JSON parse errors in error response', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: async () => {
					throw new Error('Invalid JSON');
				},
			});

			await expect(client.request('GET', '/api/tasks/' as any)).rejects.toEqual({
				status: 500,
				code: 'HTTP_ERROR',
				message: 'Internal Server Error',
			});
		});
	});

	describe('cookie authentication', () => {
		beforeEach(async () => {
			await client.connect();
		});

		it('should always include credentials', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			});

			await client.request('GET', '/api/tasks/' as any);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					credentials: 'include',
				})
			);
		});
	});

	describe('event subscriptions', () => {
		it('should not support event subscriptions', () => {
			const handler = vi.fn();
			const unsubscribe = client.subscribe('task:created' as any, handler);

			expect(unsubscribe).toBeInstanceOf(Function);
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe('transport type', () => {
		it('should return http transport type', () => {
			expect(client.getTransportType()).toBe('http');
		});
	});
});
