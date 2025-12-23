import type { IncomingMessage } from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '../auth/MockAuthService';
import { WebSocketSessionManager } from './WebSocketSessionManager';

/**
 * ===========================================================================================
 * WEBSOCKET SESSION MANAGER TESTS
 * ===========================================================================================
 *
 * Tests for WebSocket session tracking, authentication, and subscription management.
 *
 * Coverage:
 * - Connection authentication from HTTP cookies
 * - Session validation
 * - Token refresh across all user sessions
 * - Multi-device support (multiple sessions per user)
 * - Subscription tracking
 * - Session expiration and cleanup
 * - Statistics
 *
 * ===========================================================================================
 */

describe('WebSocketSessionManager', () => {
	let sessionManager: WebSocketSessionManager;
	let authService: MockAuthService;
	const testSecret = 'test-secret-key';

	beforeEach(() => {
		authService = new MockAuthService(testSecret);
		sessionManager = new WebSocketSessionManager(authService);
	});

	afterEach(() => {
		sessionManager.destroy();
		authService.destroy();
	});

	describe('authenticateConnection', () => {
		it('should authenticate connection with valid access token in cookies', async () => {
			// Generate valid access token
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Mock HTTP request with cookies
			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Authenticate connection
			const session = await sessionManager.authenticateConnection('client-1', request);

			expect(session).toMatchObject({
				clientId: 'client-1',
				userId,
				accessToken,
			});
			expect(session.tokenExpiresAt).toBeGreaterThan(Date.now());
			expect(session.createdAt).toBeLessThanOrEqual(Date.now());
			expect(session.lastActivity).toBeLessThanOrEqual(Date.now());
			expect(session.subscribedEvents).toBeInstanceOf(Set);
			expect(session.subscribedEvents.size).toBe(0);
		});

		it('should reject connection without access token', async () => {
			const request = {
				headers: {},
			} as IncomingMessage;

			await expect(sessionManager.authenticateConnection('client-1', request)).rejects.toThrow(
				'No access token in cookies'
			);
		});

		it('should reject connection with invalid access token', async () => {
			const request = {
				headers: {
					cookie: 'access_token=invalid-token',
				},
			} as IncomingMessage;

			await expect(sessionManager.authenticateConnection('client-1', request)).rejects.toThrow(
				'Invalid access token'
			);
		});

		it('should support multiple connections from same user', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Authenticate first client
			await sessionManager.authenticateConnection('client-1', request);

			// Authenticate second client (same user)
			await sessionManager.authenticateConnection('client-2', request);

			// Both sessions should exist
			const userSessions = sessionManager.getUserSessions(userId);
			expect(userSessions).toHaveLength(2);
			expect(userSessions.map(s => s.clientId)).toEqual(expect.arrayContaining(['client-1', 'client-2']));
		});
	});

	describe('validateSession', () => {
		it('should validate active session', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			// Validate session
			const result = sessionManager.validateSession('client-1');

			expect(result.userId).toBe(userId);
			expect(result.session).toMatchObject({
				clientId: 'client-1',
				userId,
			});
		});

		it('should update last activity on validation', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', request);
			const initialActivity = session.lastActivity;

			// Wait a bit
			await new Promise(resolve => setTimeout(resolve, 10));

			// Validate should update lastActivity
			sessionManager.validateSession('client-1');

			const updatedSession = sessionManager.getSession('client-1');
			expect(updatedSession?.lastActivity).toBeGreaterThan(initialActivity);
		});

		it('should reject validation for non-existent session', () => {
			expect(() => sessionManager.validateSession('non-existent-client')).toThrow('Session not found');
		});

		it('should reject validation for expired session', async () => {
			// Create a session with expired token
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', request);

			// Manually expire the session
			session.tokenExpiresAt = Date.now() - 1000;

			// Validation should fail
			expect(() => sessionManager.validateSession('client-1')).toThrow('Access token expired');
		});
	});

	describe('refreshSessionToken', () => {
		it('should refresh token for all user sessions', async () => {
			const {
				accessToken: oldToken,
				userId,
				refreshToken,
			} = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${oldToken}`,
				},
			} as IncomingMessage;

			// Create two sessions for same user
			await sessionManager.authenticateConnection('client-1', request);
			await sessionManager.authenticateConnection('client-2', request);

			// Get new access token
			const { accessToken: newToken } = await authService.refreshToken(refreshToken);

			// Refresh sessions
			await sessionManager.refreshSessionToken(userId, newToken);

			// Both sessions should have new token
			const session1 = sessionManager.getSession('client-1');
			const session2 = sessionManager.getSession('client-2');

			expect(session1?.accessToken).toBe(newToken);
			expect(session2?.accessToken).toBe(newToken);
			expect(session1?.tokenExpiresAt).toBeGreaterThan(Date.now());
			expect(session2?.tokenExpiresAt).toBeGreaterThan(Date.now());
		});

		it('should handle refresh for user with no active sessions', async () => {
			const { userId, refreshToken } = await authService.login('test@example.com', 'password');

			const { accessToken: newToken } = await authService.refreshToken(refreshToken);

			// Should not throw for user with no sessions
			await expect(sessionManager.refreshSessionToken(userId, newToken)).resolves.not.toThrow();
		});
	});

	describe('subscription management', () => {
		it('should track subscriptions', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			// Subscribe to events
			sessionManager.updateSubscriptions('client-1', 'subscribe', ['task:created', 'task:updated']);

			const subscriptions = sessionManager.getSubscriptions('client-1');
			expect(subscriptions).toContain('task:created');
			expect(subscriptions).toContain('task:updated');
			expect(subscriptions.size).toBe(2);
		});

		it('should unsubscribe from events', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			// Subscribe
			sessionManager.updateSubscriptions('client-1', 'subscribe', [
				'task:created',
				'task:updated',
				'task:deleted',
			]);

			// Unsubscribe from one
			sessionManager.updateSubscriptions('client-1', 'unsubscribe', ['task:updated']);

			const subscriptions = sessionManager.getSubscriptions('client-1');
			expect(subscriptions).toContain('task:created');
			expect(subscriptions).not.toContain('task:updated');
			expect(subscriptions).toContain('task:deleted');
			expect(subscriptions.size).toBe(2);
		});

		it('should check subscription status', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			// Initially, no subscriptions means allow all
			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);

			// After subscribing, only subscribed events allowed
			sessionManager.updateSubscriptions('client-1', 'subscribe', ['task:created']);
			expect(sessionManager.isSubscribed('client-1', 'task:created')).toBe(true);
			expect(sessionManager.isSubscribed('client-1', 'task:updated')).toBe(false);
		});

		it('should return empty set for non-existent client', () => {
			const subscriptions = sessionManager.getSubscriptions('non-existent');
			expect(subscriptions.size).toBe(0);
		});
	});

	describe('session removal', () => {
		it('should remove session', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			// Verify session exists
			expect(sessionManager.getSession('client-1')).toBeTruthy();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(1);

			// Remove session
			sessionManager.removeSession('client-1');

			// Verify session is gone
			expect(sessionManager.getSession('client-1')).toBeUndefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});

		it('should handle removal of non-existent session', () => {
			// Should not throw
			expect(() => sessionManager.removeSession('non-existent')).not.toThrow();
		});

		it('should remove client from user sessions map', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Create two sessions
			await sessionManager.authenticateConnection('client-1', request);
			await sessionManager.authenticateConnection('client-2', request);

			expect(sessionManager.getUserSessions(userId)).toHaveLength(2);

			// Remove one
			sessionManager.removeSession('client-1');

			const remainingSessions = sessionManager.getUserSessions(userId);
			expect(remainingSessions).toHaveLength(1);
			expect(remainingSessions[0].clientId).toBe('client-2');
		});
	});

	describe('time until expiration', () => {
		it('should return time until expiration', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', request);

			const timeRemaining = sessionManager.getTimeUntilExpiration('client-1');

			// Access token expires in 5 minutes (300 seconds = 300000ms)
			expect(timeRemaining).toBeGreaterThan(0);
			expect(timeRemaining).toBeLessThanOrEqual(300000);
		});

		it('should return 0 for non-existent session', () => {
			expect(sessionManager.getTimeUntilExpiration('non-existent')).toBe(0);
		});

		it('should return 0 for expired session', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', request);

			// Manually expire
			session.tokenExpiresAt = Date.now() - 1000;

			expect(sessionManager.getTimeUntilExpiration('client-1')).toBe(0);
		});
	});

	describe('statistics', () => {
		it('should return session statistics', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Create sessions
			await sessionManager.authenticateConnection('client-1', request);
			await sessionManager.authenticateConnection('client-2', request);

			const stats = sessionManager.getStats();

			expect(stats).toEqual({
				totalSessions: 2,
				totalUsers: 1,
				avgSessionsPerUser: 2,
			});
		});

		it('should return zero stats when no sessions', () => {
			const stats = sessionManager.getStats();

			expect(stats).toEqual({
				totalSessions: 0,
				totalUsers: 0,
				avgSessionsPerUser: 0,
			});
		});
	});

	describe('cleanup expired sessions', () => {
		it('should cleanup expired sessions when cleanup runs', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const request = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', request);

			// Manually expire the session
			session.tokenExpiresAt = Date.now() - 1000;

			// Validation should detect expiry and throw
			expect(() => sessionManager.validateSession('client-1')).toThrow('Access token expired');

			// After failed validation, session is removed
			expect(sessionManager.getSession('client-1')).toBeUndefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});
	});
});
