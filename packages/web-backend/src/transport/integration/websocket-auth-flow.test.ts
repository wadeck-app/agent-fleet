import type { IncomingMessage } from 'http';
import { MockOrchestratorClient } from 'orchestrator-adapters';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '@/auth/MockAuthService';
import { DataStoreFactory } from '@/factories/DataStoreFactory';

import type { TransportRequest } from '@app/shared';

import { EventBroadcaster } from '../EventBroadcaster';
import { TransportRouter } from '../TransportRouter';
import { WebSocketSessionManager } from '../WebSocketSessionManager';
import { MockTransportServer } from '../adapters/MockTransportServer';

/**
 * ===========================================================================================
 * WEBSOCKET AUTHENTICATION FLOW INTEGRATION TESTS
 * ===========================================================================================
 *
 * Integration tests for the complete WebSocket authentication flow.
 *
 * Test scenarios:
 * - Full authentication flow: Login → Connect WebSocket → Make request → Logout
 * - Token refresh during active connection
 * - Multi-device sessions
 * - Session validation across requests
 * - Token expiration handling
 * - Concurrent connections
 *
 * These tests verify the integration between:
 * - AuthService
 * - WebSocketSessionManager
 * - TransportRouter
 * - EventBroadcaster
 *
 * ===========================================================================================
 */

describe('WebSocket Authentication Flow Integration', () => {
	let authService: MockAuthService;
	let sessionManager: WebSocketSessionManager;
	let router: TransportRouter;
	let broadcaster: EventBroadcaster;
	let mockTransport: MockTransportServer;
	let factory: DataStoreFactory;

	beforeEach(() => {
		// Create factory
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

		// Register broadcaster with factory
		factory.setEventBroadcaster(broadcaster);

		// Create router
		router = new TransportRouter(factory);
	});

	describe('complete authentication flow', () => {
		it('should complete full login → connect → request → logout flow', async () => {
			// Step 1: Login via HTTP to get tokens
			const { accessToken, refreshToken, userId } = await authService.login('test@example.com', 'password');

			expect(userId).toBeDefined();
			expect(accessToken).toBeTruthy();
			expect(refreshToken).toBeTruthy();

			// Step 2: Connect WebSocket with access token
			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			expect(session.userId).toBe(userId);
			expect(session.accessToken).toBe(accessToken);
			expect(session.tokenExpiresAt).toBeGreaterThan(Date.now());

			// Step 3: Make authenticated request through WebSocket
			const request: TransportRequest = {
				id: 'req-1',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			// Add userId to request (as WebSocketTransportServer would do)
			(request as any).userId = session.userId;

			const response = await router.handleRequest(request);

			expect(response.status).toBe(200);
			expect(response.body).toBeDefined();

			// Step 4: Logout and blacklist token
			authService.blacklistToken(accessToken);

			// Step 5: Verify token is no longer valid
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');

			// Step 6: Session validation should fail
			sessionManager.removeSession('client-1');
			expect(sessionManager.getSession('client-1')).toBeUndefined();
		});

		it('should handle session validation at each step', async () => {
			// Login
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Connect
			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Validate session multiple times
			const validation1 = sessionManager.validateSession('client-1');
			expect(validation1.userId).toBe(userId);

			const validation2 = sessionManager.validateSession('client-1');
			expect(validation2.userId).toBe(userId);

			// Session should still be valid
			const session = sessionManager.getSession('client-1');
			expect(session).toBeDefined();
			expect(session?.userId).toBe(userId);
		});
	});

	describe('token refresh during active connection', () => {
		it('should refresh token and update all WebSocket sessions', async () => {
			// Login
			const {
				accessToken: oldToken,
				refreshToken,
				userId,
			} = await authService.login('test@example.com', 'password');

			// Connect two WebSocket clients (multi-device)
			const req1 = {
				headers: {
					cookie: `access_token=${oldToken}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${oldToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);

			// Verify both sessions have old token
			const session1Before = sessionManager.getSession('client-1');
			const session2Before = sessionManager.getSession('client-2');

			expect(session1Before?.accessToken).toBe(oldToken);
			expect(session2Before?.accessToken).toBe(oldToken);

			// Refresh token (HTTP endpoint would do this)
			const { accessToken: newToken } = await authService.refreshToken(refreshToken);

			// Update all WebSocket sessions with new token
			await sessionManager.refreshSessionToken(userId, newToken);

			// Verify both sessions have new token
			const session1After = sessionManager.getSession('client-1');
			const session2After = sessionManager.getSession('client-2');

			expect(session1After?.accessToken).toBe(newToken);
			expect(session2After?.accessToken).toBe(newToken);

			// Verify new token is valid
			const payload = await authService.verifyAccessToken(newToken);
			expect(payload.userId).toBe(userId);
		});

		it('should allow requests with new token after refresh', async () => {
			// Login
			const {
				accessToken: oldToken,
				refreshToken,
				userId,
			} = await authService.login('test@example.com', 'password');

			// Connect
			const req = {
				headers: {
					cookie: `access_token=${oldToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Make request with old token
			const request1: TransportRequest = {
				id: 'req-1',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			(request1 as any).userId = userId;

			const response1 = await router.handleRequest(request1);
			expect(response1.status).toBe(200);

			// Refresh token
			const { accessToken: newToken } = await authService.refreshToken(refreshToken);
			await sessionManager.refreshSessionToken(userId, newToken);

			// Make request after refresh
			const request2: TransportRequest = {
				id: 'req-2',
				method: 'GET',
				path: '/api/workspaces',
				timestamp: Date.now(),
			};

			(request2 as any).userId = userId;

			const response2 = await router.handleRequest(request2);
			expect(response2.status).toBe(200);
		});
	});

	describe('multi-device support', () => {
		it('should support multiple concurrent connections from same user', async () => {
			// Login once
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Connect multiple devices
			const devices = ['phone', 'laptop', 'tablet'];

			for (const device of devices) {
				const req = {
					headers: {
						cookie: `access_token=${accessToken}`,
					},
				} as IncomingMessage;

				await sessionManager.authenticateConnection(`client-${device}`, req);
			}

			// Verify all sessions exist
			const userSessions = sessionManager.getUserSessions(userId);
			expect(userSessions).toHaveLength(3);

			const clientIds = userSessions.map(s => s.clientId);
			expect(clientIds).toContain('client-phone');
			expect(clientIds).toContain('client-laptop');
			expect(clientIds).toContain('client-tablet');
		});

		it('should broadcast events to all user devices', async () => {
			// Login
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Connect two devices
			const req1 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);

			// Simulate both clients connecting to transport
			mockTransport.simulateConnect('client-1');
			mockTransport.simulateConnect('client-2');

			// Broadcast event to user
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo' as const,
				assignedWorker: null,
				priority: 'high' as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			broadcaster.sendToUser(userId, 'b2f:task:created', task);

			// Verify both clients received the event
			expect(mockTransport.clientSends).toHaveLength(2);
			expect(mockTransport.clientSends[0].clientId).toBe('client-1');
			expect(mockTransport.clientSends[1].clientId).toBe('client-2');
			expect(mockTransport.clientSends[0].data).toEqual(task);
			expect(mockTransport.clientSends[1].data).toEqual(task);
		});

		it('should handle individual device disconnection', async () => {
			// Login
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Connect two devices
			const req1 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req1);
			await sessionManager.authenticateConnection('client-2', req2);

			// Disconnect one device
			sessionManager.removeSession('client-1');

			// Other device should still be connected
			const userSessions = sessionManager.getUserSessions(userId);
			expect(userSessions).toHaveLength(1);
			expect(userSessions[0].clientId).toBe('client-2');
		});
	});

	describe('token expiration handling', () => {
		it('should detect expired token in session validation', async () => {
			// Login
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Connect
			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Manually expire the token
			session.tokenExpiresAt = Date.now() - 1000;

			// Validation should fail
			expect(() => sessionManager.validateSession('client-1')).toThrow('Access token expired');
		});

		it('should calculate time until expiration correctly', async () => {
			// Login
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Connect
			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Get time until expiration
			const timeRemaining = sessionManager.getTimeUntilExpiration('client-1');

			// Should be between 0 and 5 minutes (300000ms)
			expect(timeRemaining).toBeGreaterThan(0);
			expect(timeRemaining).toBeLessThanOrEqual(300000);
		});
	});

	describe('concurrent operations', () => {
		it('should handle multiple simultaneous login attempts', async () => {
			const logins = await Promise.all([
				authService.login('test@example.com', 'password'),
				authService.login('test@example.com', 'password'),
				authService.login('test@example.com', 'password'),
			]);

			expect(logins).toHaveLength(3);
			logins.forEach(login => {
				expect(login.userId).toBe('test-user-123');
				expect(login.accessToken).toBeTruthy();
				expect(login.refreshToken).toBeTruthy();
			});
		});

		it('should handle multiple concurrent WebSocket connections', async () => {
			// Login
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Connect multiple clients concurrently
			const connections = await Promise.all([
				sessionManager.authenticateConnection('client-1', req),
				sessionManager.authenticateConnection('client-2', req),
				sessionManager.authenticateConnection('client-3', req),
			]);

			expect(connections).toHaveLength(3);
			expect(connections.every(c => c.userId === userId)).toBe(true);

			// Verify all sessions exist
			const userSessions = sessionManager.getUserSessions(userId);
			expect(userSessions).toHaveLength(3);
		});

		it('should handle concurrent requests on same session', async () => {
			// Login and connect
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Make multiple concurrent requests
			const requests = [
				{
					id: 'req-1',
					method: 'GET' as const,
					path: '/api/workspaces',
					timestamp: Date.now(),
				},
				{
					id: 'req-2',
					method: 'GET' as const,
					path: '/api/workspaces',
					timestamp: Date.now(),
				},
				{
					id: 'req-3',
					method: 'GET' as const,
					path: '/api/workspaces',
					timestamp: Date.now(),
				},
			];

			// Add userId to all requests
			requests.forEach(r => {
				(r as any).userId = userId;
			});

			const responses = await Promise.all(requests.map(r => router.handleRequest(r)));

			expect(responses).toHaveLength(3);
			expect(responses.every(r => r.status === 200)).toBe(true);
		});
	});

	describe('error scenarios', () => {
		it('should handle invalid session validation gracefully', () => {
			expect(() => sessionManager.validateSession('non-existent-client')).toThrow('Session not found');
		});

		it('should handle token blacklisting correctly', async () => {
			// Login
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Verify token works
			await authService.verifyAccessToken(accessToken);

			// Blacklist token
			authService.blacklistToken(accessToken);

			// Token should be rejected
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});

		it('should handle refresh with blacklisted token', async () => {
			// Login
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Blacklist refresh token
			authService.blacklistToken(refreshToken);

			// Refresh should fail
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});
	});

	describe('session cleanup', () => {
		it('should remove session data on disconnection', async () => {
			// Login and connect
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Verify session exists
			expect(sessionManager.getSession('client-1')).toBeDefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(1);

			// Remove session
			sessionManager.removeSession('client-1');

			// Verify cleanup
			expect(sessionManager.getSession('client-1')).toBeUndefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});

		it('should clean up all sessions for a user', async () => {
			// Login
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Create multiple sessions
			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);
			await sessionManager.authenticateConnection('client-3', req);

			expect(sessionManager.getUserSessions(userId)).toHaveLength(3);

			// Remove all sessions
			sessionManager.removeSession('client-1');
			sessionManager.removeSession('client-2');
			sessionManager.removeSession('client-3');

			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});
	});
});
