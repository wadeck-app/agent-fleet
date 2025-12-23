import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '../auth/MockAuthService';
import { WebSocketSessionManager } from '../transport/WebSocketSessionManager';
import { MockTransportServer } from '../transport/adapters/MockTransportServer';
import MonitoringController from './MonitoringController';

/**
 * ===========================================================================================
 * MONITORING CONTROLLER TESTS
 * ===========================================================================================
 *
 * Tests for MonitoringController - transport layer monitoring endpoints.
 *
 * Test coverage:
 * - GET /api/monitoring/transport/health (returns 200, correct structure)
 * - GET /api/monitoring/transport/stats (accurate statistics)
 * - GET /api/monitoring/transport/sessions (auth required, correct data)
 * - Subscription breakdown calculation
 * - Uptime tracking
 *
 * ===========================================================================================
 */

/**
 * Mock route wrapper function
 * Captures routes registered by controller
 */
function createMockRouteWrapper() {
	const routes: Array<{ method: string; path: string; handler: (req: any) => Promise<any> }> = [];

	const add = (method: string, path: string, handler: (req: any) => Promise<any>) => {
		routes.push({ method, path, handler });
	};

	return { add, routes };
}

/**
 * Helper to create mock IncomingMessage with cookies
 */
function createMockRequest(userId?: string) {
	return {
		userId,
		headers: {
			cookie: userId ? `access_token=token_for_${userId}` : '',
		},
	};
}

describe('MonitoringController', () => {
	let controller: MonitoringController;
	let transportServer: MockTransportServer;
	let sessionManager: WebSocketSessionManager;
	let authService: MockAuthService;

	beforeEach(() => {
		// Create auth service
		authService = new MockAuthService('test-secret');

		// Create session manager
		sessionManager = new WebSocketSessionManager(authService);

		// Create transport server
		transportServer = new MockTransportServer();
		transportServer.setTestDependencies(sessionManager, authService);

		// Create controller
		controller = new MonitoringController(transportServer, sessionManager);
	});

	describe('GET /api/monitoring/transport/health', () => {
		it('should return health status with correct structure', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Find health route
			const healthRoute = routes.find(r => r.path === '/api/monitoring/transport/health' && r.method === 'GET');
			expect(healthRoute).toBeDefined();

			// Call handler
			const result = await healthRoute!.handler({});

			// Verify response structure
			expect(result).toMatchObject({
				transport: 'ok',
				auth: 'ok',
				connectedClients: 0,
				uptime: expect.any(Number),
				timestamp: expect.any(Number),
			});

			// Verify uptime is positive
			expect(result.uptime).toBeGreaterThanOrEqual(0);

			// Verify timestamp is recent
			expect(result.timestamp).toBeGreaterThan(Date.now() - 1000);
		});

		it('should return ok when transport is healthy', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const healthRoute = routes.find(r => r.path === '/api/monitoring/transport/health' && r.method === 'GET');

			const result = await healthRoute!.handler({});

			expect(result.transport).toBe('ok');
			expect(result.auth).toBe('ok');
		});

		it('should include connected clients count', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Connect a client
			await transportServer.simulateConnection('client-1', 'user-1');

			const healthRoute = routes.find(r => r.path === '/api/monitoring/transport/health' && r.method === 'GET');

			const result = await healthRoute!.handler({});

			expect(result.connectedClients).toBe(1);
		});
	});

	describe('GET /api/monitoring/transport/stats', () => {
		it('should return accurate statistics', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Connect multiple clients
			await transportServer.simulateConnection('client-1', 'user-1');
			await transportServer.simulateConnection('client-2', 'user-1'); // Same user, different device
			await transportServer.simulateConnection('client-3', 'user-2');

			const statsRoute = routes.find(r => r.path === '/api/monitoring/transport/stats' && r.method === 'GET');
			expect(statsRoute).toBeDefined();

			const result = await statsRoute!.handler({});

			// Verify statistics
			expect(result).toMatchObject({
				connectedClients: 3,
				totalUsers: 2,
				avgSessionsPerUser: 1.5, // 3 sessions / 2 users
				subscriptions: expect.any(Object),
				uptime: expect.any(Number),
				timestamp: expect.any(Number),
			});
		});

		it('should calculate subscription breakdown correctly', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Connect clients and subscribe to events
			await transportServer.simulateConnection('client-1', 'user-1');
			await transportServer.simulateConnection('client-2', 'user-2');

			// Subscribe to events
			sessionManager.updateSubscriptions('client-1', 'subscribe', ['b2f:task:created', 'b2f:task:updated']);
			sessionManager.updateSubscriptions('client-2', 'subscribe', ['b2f:task:created', 'b2f:worker:heartbeat']);

			const statsRoute = routes.find(r => r.path === '/api/monitoring/transport/stats' && r.method === 'GET');

			const result = await statsRoute!.handler({});

			// Verify subscription breakdown
			expect(result.subscriptions).toEqual({
				'b2f:task:created': 2, // Both clients subscribed
				'b2f:task:updated': 1, // Only client-1
				'b2f:worker:heartbeat': 1, // Only client-2
			});
		});

		it('should return zero stats when no clients connected', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const statsRoute = routes.find(r => r.path === '/api/monitoring/transport/stats' && r.method === 'GET');

			const result = await statsRoute!.handler({});

			expect(result).toMatchObject({
				connectedClients: 0,
				totalUsers: 0,
				avgSessionsPerUser: 0,
				subscriptions: {},
			});
		});
	});

	describe('GET /api/monitoring/transport/sessions', () => {
		it('should return empty sessions for non-authenticated users', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const sessionsRoute = routes.find(
				r => r.path === '/api/monitoring/transport/sessions' && r.method === 'GET'
			);
			expect(sessionsRoute).toBeDefined();

			// Call without userId in request
			const result = await sessionsRoute!.handler({
				request: {},
			});

			expect(result).toMatchObject({
				sessions: [],
				totalSessions: 0,
				totalUsers: 0,
				timestamp: expect.any(Number),
			});
		});

		it('should return session details for authenticated users', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Connect clients
			await transportServer.simulateConnection('client-1', 'user-1');
			await transportServer.simulateConnection('client-2', 'user-2');

			// Subscribe to events
			sessionManager.updateSubscriptions('client-1', 'subscribe', ['b2f:task:created']);

			const sessionsRoute = routes.find(
				r => r.path === '/api/monitoring/transport/sessions' && r.method === 'GET'
			);

			// Call with authenticated user
			const result = await sessionsRoute!.handler({
				request: createMockRequest('user-1'),
			});

			expect(result.sessions).toHaveLength(2);
			expect(result.totalSessions).toBe(2);
			expect(result.totalUsers).toBe(2);

			// Verify session structure
			const session1 = result.sessions.find((s: any) => s.clientId === 'client-1');
			expect(session1).toMatchObject({
				clientId: 'client-1',
				userId: 'user-1',
				createdAt: expect.any(Number),
				lastActivity: expect.any(Number),
				tokenExpiresAt: expect.any(Number),
				subscribedEvents: ['b2f:task:created'],
			});

			const session2 = result.sessions.find((s: any) => s.clientId === 'client-2');
			expect(session2).toMatchObject({
				clientId: 'client-2',
				userId: 'user-2',
				subscribedEvents: [], // No subscriptions
			});
		});

		it('should handle multiple sessions per user', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Same user on different devices
			await transportServer.simulateConnection('client-1', 'user-1');
			await transportServer.simulateConnection('client-2', 'user-1');
			await transportServer.simulateConnection('client-3', 'user-1');

			const sessionsRoute = routes.find(
				r => r.path === '/api/monitoring/transport/sessions' && r.method === 'GET'
			);

			const result = await sessionsRoute!.handler({
				request: createMockRequest('user-1'),
			});

			expect(result.sessions).toHaveLength(3);
			expect(result.totalUsers).toBe(1);

			// All sessions should belong to user-1
			result.sessions.forEach((session: any) => {
				expect(session.userId).toBe('user-1');
			});
		});
	});

	describe('uptime tracking', () => {
		it('should track uptime correctly', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const healthRoute = routes.find(r => r.path === '/api/monitoring/transport/health' && r.method === 'GET');

			// First call
			const result1 = await healthRoute!.handler({});
			const uptime1 = result1.uptime;

			// Wait a bit
			await new Promise(resolve => setTimeout(resolve, 10));

			// Second call
			const result2 = await healthRoute!.handler({});
			const uptime2 = result2.uptime;

			// Uptime should increase
			expect(uptime2).toBeGreaterThan(uptime1);
		});
	});
});
