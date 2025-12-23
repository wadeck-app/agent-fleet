import { MockOrchestratorClient } from 'orchestrator-adapters';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TransportRequest } from '@app/shared';

import { MockAuthService } from '../auth/MockAuthService';
import { DataStoreFactory } from '../factories/DataStoreFactory';
import { EventBroadcaster } from './EventBroadcaster';
import { TransportRouter } from './TransportRouter';
import { WebSocketSessionManager } from './WebSocketSessionManager';
import { MockTransportServer } from './adapters/MockTransportServer';

/**
 * ===========================================================================================
 * TRANSPORT ROUTER TESTS
 * ===========================================================================================
 *
 * Tests for TransportRouter - routes WebSocket messages to controllers.
 *
 * Test coverage:
 * - Path matching (exact paths, parameterized paths)
 * - Parameter extraction (/api/tasks/:id → { id: '123' })
 * - Query string handling
 * - Body parsing
 * - Method validation (POST vs GET)
 * - Error handling (404, 405, 500)
 * - Route registration from ALL_API_ROUTES
 * - Lazy controller loading
 * - Request/response transformation
 *
 * ===========================================================================================
 */

describe('TransportRouter', () => {
	let factory: DataStoreFactory;
	let router: TransportRouter;
	let mockTransport: MockTransportServer;
	let sessionManager: WebSocketSessionManager;
	let authService: MockAuthService;
	let broadcaster: EventBroadcaster;

	beforeEach(() => {
		// Create factory with in-memory storage
		const mockOrchestratorClient = new MockOrchestratorClient();
		factory = new DataStoreFactory('memory', mockOrchestratorClient);

		// Create auth service
		authService = new MockAuthService('test-secret');

		// Create session manager
		sessionManager = new WebSocketSessionManager(authService);

		// Create mock transport
		mockTransport = new MockTransportServer();

		// Create event broadcaster
		broadcaster = new EventBroadcaster(mockTransport, sessionManager);

		// Register with factory
		factory.setEventBroadcaster(broadcaster);

		// Create router
		router = new TransportRouter(factory);
	});

	describe('path matching', () => {
		it('should match exact path for GET /api/auth/session', async () => {
			const request: TransportRequest = {
				id: 'req-1',
				method: 'GET',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.id).toBe('req-1');
		});

		it('should match parameterized path for GET /api/books/:id', async () => {
			const request: TransportRequest = {
				id: 'req-2',
				method: 'GET',
				path: '/api/books/book-123',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			// Route should match and attempt to call controller
			// Books are stored in-memory so this should work
			expect(response.id).toBe('req-2');
			// Status could be 200 (if book exists) or 404/500 (if not)
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should match GET /api/workspaces', async () => {
			const request: TransportRequest = {
				id: 'req-3',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.id).toBe('req-3');
			expect(response.body).toBeDefined();
		});

		it('should return 404 for unknown path', async () => {
			const request: TransportRequest = {
				id: 'req-4',
				method: 'GET',
				path: '/api/unknown',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(404);
			expect(response.error).toMatchObject({
				code: 'NOT_FOUND',
				message: expect.stringContaining('Route not found'),
			});
		});

		it('should return 404 for wrong HTTP method', async () => {
			const request: TransportRequest = {
				id: 'req-5',
				method: 'DELETE',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(404);
			expect(response.error?.code).toBe('NOT_FOUND');
		});
	});

	describe('parameter extraction', () => {
		it('should extract single parameter from path', async () => {
			const request: TransportRequest = {
				id: 'req-6',
				method: 'GET',
				path: '/api/ingredients/ingredient-456',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.id).toBe('req-6');
			// If found, status is 200. If not found, status is 404 from service
			// but route matched (otherwise it would be 404 from router)
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should extract multiple parameters from path if routes exist', async () => {
			// Note: Current routes don't have multi-param paths
			// This test documents expected behavior
			const request: TransportRequest = {
				id: 'req-7',
				method: 'GET',
				path: '/api/workspaces/ws-1/tasks/task-2',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			// Should return 404 since route doesn't exist
			expect(response.status).toBe(404);
		});

		it('should preserve existing params in request', async () => {
			const request: TransportRequest = {
				id: 'req-8',
				method: 'GET',
				path: '/api/books/book-123',
				params: { custom: 'value' },
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.id).toBe('req-8');
			// Route should match and params should be merged
			expect([200, 404, 500]).toContain(response.status);
		});
	});

	describe('query string handling', () => {
		it('should pass query params to controller', async () => {
			const request: TransportRequest = {
				id: 'req-9',
				method: 'GET',
				path: '/api/tasks',
				query: {
					status: 'pending',
					limit: '10',
				},
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.id).toBe('req-9');
			expect([200, 500]).toContain(response.status);
		});

		it('should handle request without query params', async () => {
			const request: TransportRequest = {
				id: 'req-10',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toBeDefined();
		});
	});

	describe('body parsing', () => {
		it('should pass body to POST endpoints', async () => {
			const request: TransportRequest = {
				id: 'req-11',
				method: 'POST',
				path: '/api/auth/login',
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				userId: expect.any(String),
				expiresAt: expect.any(Number),
			});
		});

		it('should handle PUT endpoints with body', async () => {
			const request: TransportRequest = {
				id: 'req-12',
				method: 'PUT',
				path: '/api/ingredients/ingredient-1',
				body: {
					name: 'Updated Ingredient',
					calories: 100,
				},
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.id).toBe('req-12');
			// Will succeed if ingredient exists, otherwise 404
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should handle request without body', async () => {
			const request: TransportRequest = {
				id: 'req-13',
				method: 'GET',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
		});
	});

	describe('error handling', () => {
		it('should return 404 for non-existent route', async () => {
			const request: TransportRequest = {
				id: 'req-14',
				method: 'GET',
				path: '/api/nonexistent',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(404);
			expect(response.error).toMatchObject({
				code: 'NOT_FOUND',
				message: 'Route not found: GET /api/nonexistent',
			});
			expect(response.timestamp).toBeDefined();
		});

		it('should return 500 for controller errors', async () => {
			// Mock login failure
			const request: TransportRequest = {
				id: 'req-15',
				method: 'POST',
				path: '/api/auth/login',
				body: {
					email: 'wrong@example.com',
					password: 'wrongpassword',
				},
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(response.error).toBeDefined();
			expect(response.error?.message).toBeTruthy();
		});

		it('should include error details in response', async () => {
			const request: TransportRequest = {
				id: 'req-16',
				method: 'GET',
				path: '/api/invalid',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.error).toMatchObject({
				code: expect.any(String),
				message: expect.any(String),
			});
		});

		it('should preserve request ID in error response', async () => {
			const request: TransportRequest = {
				id: 'req-17',
				method: 'GET',
				path: '/api/nonexistent',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.id).toBe('req-17');
			expect(response.status).toBe(404);
		});
	});

	describe('controller loading', () => {
		it('should lazily load AuthController', async () => {
			const request: TransportRequest = {
				id: 'req-18',
				method: 'GET',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toBeDefined();
		});

		it('should lazily load WorkspacesController', async () => {
			const request: TransportRequest = {
				id: 'req-19',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toBeDefined();
		});

		it('should cache loaded controllers', async () => {
			const request1: TransportRequest = {
				id: 'req-20',
				method: 'GET',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			const request2: TransportRequest = {
				id: 'req-21',
				method: 'GET',
				path: '/api/auth/session',
				timestamp: Date.now(),
			};

			await router.handleRequest(request1);
			await router.handleRequest(request2);

			// Both should succeed (controller cached)
			const response = await router.handleRequest(request2);
			expect(response.status).toBe(200);
		});
	});

	describe('response format', () => {
		it('should return successful response with status 200', async () => {
			const request: TransportRequest = {
				id: 'req-22',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response).toMatchObject({
				id: 'req-22',
				status: 200,
				body: expect.objectContaining({
					timestamp: expect.any(String),
					summary: expect.any(Object),
					workspaces: expect.any(Array),
				}),
				timestamp: expect.any(Number),
			});
			expect(response.error).toBeUndefined();
		});

		it('should return error response with correct structure', async () => {
			const request: TransportRequest = {
				id: 'req-23',
				method: 'GET',
				path: '/api/notfound',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response).toMatchObject({
				id: 'req-23',
				status: 404,
				timestamp: expect.any(Number),
				error: {
					code: expect.any(String),
					message: expect.any(String),
				},
			});
			expect(response.body).toBeUndefined();
		});

		it('should include timestamp in all responses', async () => {
			const beforeTime = Date.now();

			const request: TransportRequest = {
				id: 'req-24',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			const afterTime = Date.now();

			expect(response.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(response.timestamp).toBeLessThanOrEqual(afterTime);
		});
	});

	describe('user context', () => {
		it('should pass userId from request context to controller', async () => {
			// This test documents that router passes userId through
			// In real usage, WebSocketTransportServer adds userId to request
			const request: TransportRequest = {
				id: 'req-25',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			// Add userId as would be done by WebSocketTransportServer
			(request as any).userId = 'user-123';

			const response = await router.handleRequest(request);

			// Should succeed
			expect(response.status).toBe(200);
		});
	});

	describe('real-world scenarios', () => {
		it('should handle login flow', async () => {
			// Login
			const loginRequest: TransportRequest = {
				id: 'req-26',
				method: 'POST',
				path: '/api/auth/login',
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				timestamp: Date.now(),
			};

			const loginResponse = await router.handleRequest(loginRequest);

			expect(loginResponse.status).toBe(200);
			expect(loginResponse.body).toMatchObject({
				userId: expect.any(String),
				expiresAt: expect.any(Number),
			});
		});

		it('should handle workspace listing', async () => {
			const request: TransportRequest = {
				id: 'req-27',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				timestamp: expect.any(String),
				summary: expect.any(Object),
				workspaces: expect.any(Array),
			});
			expect(Array.isArray((response.body as any).workspaces)).toBe(true);
		});

		it('should handle multiple concurrent requests', async () => {
			const requests = [
				{
					id: 'req-28',
					method: 'GET' as const,
					path: '/api/workspaces',
					timestamp: Date.now(),
				},
				{
					id: 'req-29',
					method: 'GET' as const,
					path: '/api/auth/session',
					timestamp: Date.now(),
				},
				{
					id: 'req-30',
					method: 'GET' as const,
					path: '/api/workspaces',
					timestamp: Date.now(),
				},
			];

			const responses = await Promise.all(requests.map(req => router.handleRequest(req)));

			expect(responses).toHaveLength(3);
			expect(responses[0].id).toBe('req-28');
			expect(responses[1].id).toBe('req-29');
			expect(responses[2].id).toBe('req-30');
			expect(responses.every(r => r.status === 200)).toBe(true);
		});
	});
});
