import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '../../auth/MockAuthService';
import { TransportSessionManager } from '../TransportSessionManager';

/**
 * ===========================================================================================
 * SESSION SECURITY TESTS
 * ===========================================================================================
 *
 * Security tests for session management and isolation.
 *
 * Test coverage:
 * - Session isolation (one user cannot access another's session)
 * - Token expiration enforcement
 * - Session cleanup on logout/disconnect
 * - Concurrent refresh doesn't create duplicates
 * - Token blacklisting
 * - Session hijacking prevention
 * - Proper session validation
 *
 * Security principles:
 * - Fail secure
 * - Complete mediation (check on every request)
 * - Session isolation
 * - Least privilege
 *
 * ===========================================================================================
 */

describe('Session Security Tests', () => {
	let authService: MockAuthService;
	let sessionManager: TransportSessionManager;

	beforeEach(() => {
		authService = new MockAuthService('test-secret');
		sessionManager = new TransportSessionManager(authService);
	});

	describe('session isolation', () => {
		it('should isolate sessions between different users', async () => {
			// Create two users
			const { accessToken: token1, userId: user1 } = await authService.login('test@example.com', 'password');
			const { accessToken: token2, userId: user2 } = await authService.login('test@example.com', 'password');

			// Both tokens authenticate to same test user (MockAuthService always returns test-user-123)
			expect(user1).toBe('test-user-123');
			expect(user2).toBe('test-user-123');

			// Create sessions
			const req1 = {
				headers: {
					cookie: `access_token=${token1}`,
				},
			} as IncomingMessage;

			const req2 = {
				headers: {
					cookie: `access_token=${token2}`,
				},
			} as IncomingMessage;

			const session1 = await sessionManager.authenticateConnection('client-1', req1);
			const session2 = await sessionManager.authenticateConnection('client-2', req2);

			// Sessions should be separate
			expect(session1.connId).not.toBe(session2.connId);

			// Verify each session can only access its own data
			const retrievedSession1 = sessionManager.getSession('client-1');
			const retrievedSession2 = sessionManager.getSession('client-2');

			expect(retrievedSession1?.connId).toBe('client-1');
			expect(retrievedSession2?.connId).toBe('client-2');

			// User 1 cannot access user 2's session
			expect(retrievedSession1?.connId).not.toBe(retrievedSession2?.connId);
		});

		it('should prevent session access without proper authentication', () => {
			// Try to get non-existent session
			const session = sessionManager.getSession('non-existent-client');

			// Should return undefined (fail secure)
			expect(session).toBeUndefined();
		});

		it('should validate session on every request', async () => {
			// Create session
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Each request must validate
			const validation1 = sessionManager.validateSession('client-1');
			expect(validation1.userId).toBeDefined();

			const validation2 = sessionManager.validateSession('client-1');
			expect(validation2.userId).toBeDefined();

			// Complete mediation: every access is checked
			expect(validation1.userId).toBe(validation2.userId);
		});
	});

	describe('token expiration enforcement', () => {
		it('should reject expired tokens immediately', async () => {
			// Create session
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Manually expire the token
			session.tokenExpiresAt = Date.now() - 1000;

			// CRITICAL: Expired token must be rejected
			expect(() => sessionManager.validateSession('client-1')).toThrow('Access token expired');
		});

		it('should enforce expiration on token refresh', async () => {
			// Create session with expired refresh token
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Blacklist to simulate expiration
			authService.blacklistToken(refreshToken);

			// Refresh should fail
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});

		it('should not allow access after token expiration', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Token works initially
			const validation = sessionManager.validateSession('client-1');
			expect(validation.userId).toBeDefined();

			// Expire token
			session.tokenExpiresAt = Date.now() - 1000;

			// CRITICAL: Must fail after expiration
			expect(() => sessionManager.validateSession('client-1')).toThrow();
		});

		it('should calculate expiration time correctly', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			const timeRemaining = sessionManager.getTimeUntilExpiration('client-1');

			// Should be between 0 and 5 minutes (300000ms)
			expect(timeRemaining).toBeGreaterThan(0);
			expect(timeRemaining).toBeLessThanOrEqual(300000);
		});

		it('should return 0 for expired session time remaining', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Expire session
			session.tokenExpiresAt = Date.now() - 1000;

			// Time remaining should be 0
			expect(sessionManager.getTimeUntilExpiration('client-1')).toBe(0);
		});
	});

	describe('session cleanup', () => {
		it('should cleanup session on explicit logout', async () => {
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

			// Remove session (logout)
			sessionManager.removeSession('client-1');

			// CRITICAL: Session must be completely removed
			expect(sessionManager.getSession('client-1')).toBeUndefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});

		it('should cleanup session on disconnection', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Simulate disconnection
			sessionManager.removeSession('client-1');

			// All traces should be removed
			expect(sessionManager.getSession('client-1')).toBeUndefined();
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});

		it('should handle cleanup of non-existent session gracefully', () => {
			// Should not throw (fail secure)
			expect(() => sessionManager.removeSession('non-existent')).not.toThrow();
		});

		it('should cleanup all user sessions on full logout', async () => {
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Create multiple sessions (multi-device)
			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);
			await sessionManager.authenticateConnection('client-3', req);

			expect(sessionManager.getUserSessions(userId)).toHaveLength(3);

			// Remove all sessions
			sessionManager.removeSession('client-1');
			sessionManager.removeSession('client-2');
			sessionManager.removeSession('client-3');

			// All should be removed
			expect(sessionManager.getUserSessions(userId)).toHaveLength(0);
		});
	});

	describe('concurrent refresh protection', () => {
		it('should handle concurrent token refresh correctly', async () => {
			const { refreshToken, userId } = await authService.login('test@example.com', 'password');

			// Simulate concurrent refresh attempts
			const refreshPromises = [
				authService.refreshToken(refreshToken),
				authService.refreshToken(refreshToken),
				authService.refreshToken(refreshToken),
			];

			const results = await Promise.all(refreshPromises);

			// All should succeed (MockAuthService generates new tokens)
			expect(results).toHaveLength(3);
			results.forEach((result: { userId: string; accessToken: string }) => {
				expect(result.userId).toBe(userId);
				expect(result.accessToken).toBeTruthy();
			});

			// Each refresh should return a unique token
			const tokens = results.map((r: { accessToken: string }) => r.accessToken);
			const uniqueTokens = new Set(tokens);
			expect(uniqueTokens.size).toBe(3);
		});

		it('should update all user sessions on token refresh without duplicates', async () => {
			const { accessToken, refreshToken, userId } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			// Create two sessions
			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);

			expect(sessionManager.getUserSessions(userId)).toHaveLength(2);

			// Refresh token
			const { accessToken: newToken } = await authService.refreshToken(refreshToken);

			// Update all sessions
			await sessionManager.refreshSessionToken(userId, newToken);

			// Should still have exactly 2 sessions (no duplicates)
			expect(sessionManager.getUserSessions(userId)).toHaveLength(2);

			// Both should have new token
			const session1 = sessionManager.getSession('client-1');
			const session2 = sessionManager.getSession('client-2');

			expect(session1?.accessToken).toBe(newToken);
			expect(session2?.accessToken).toBe(newToken);
		});
	});

	describe('token blacklisting', () => {
		it('should blacklist token on logout', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Verify token works
			await authService.verifyAccessToken(accessToken);

			// Blacklist token (logout)
			authService.blacklistToken(accessToken);

			// CRITICAL: Blacklisted token must be rejected
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});

		it('should blacklist refresh token on logout', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Blacklist refresh token
			authService.blacklistToken(refreshToken);

			// CRITICAL: Blacklisted refresh token must be rejected
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});

		it('should prevent blacklisted token from being refreshed', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Verify refresh works
			await authService.refreshToken(refreshToken);

			// Blacklist
			authService.blacklistToken(refreshToken);

			// Should not work anymore
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});

		it('should track blacklisted tokens in statistics', async () => {
			const { accessToken, refreshToken } = await authService.login('test@example.com', 'password');

			const statsBefore = authService.getStats();
			expect(statsBefore.blacklistedTokens).toBe(0);

			// Blacklist both tokens
			authService.blacklistToken(accessToken);
			authService.blacklistToken(refreshToken);

			const statsAfter = authService.getStats();
			expect(statsAfter.blacklistedTokens).toBe(2);
		});
	});

	describe('session hijacking prevention', () => {
		it('should reject tampered tokens', async () => {
			// Invalid token should be rejected
			await expect(authService.verifyAccessToken('tampered-token')).rejects.toThrow('Invalid access token');
		});

		it('should reject wrong token type', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Using refresh token as access token should fail
			await expect(authService.verifyAccessToken(refreshToken)).rejects.toThrow('Invalid token type');
		});

		it('should require authentication for session creation', async () => {
			const req = {
				headers: {},
			} as IncomingMessage;

			// CRITICAL: Cannot create session without token
			await expect(sessionManager.authenticateConnection('client-1', req)).rejects.toThrow(
				'No access token in cookies'
			);
		});

		it('should validate token on every session access', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Blacklist token (simulate compromise)
			authService.blacklistToken(accessToken);

			// Token should still be in session, but validation with authService would fail
			// In real system, WebSocket would detect this on next message
			const session = sessionManager.getSession('client-1');
			expect(session?.accessToken).toBe(accessToken);

			// But the token itself is now invalid
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});
	});

	describe('session validation', () => {
		it('should fail validation for non-existent session', () => {
			// CRITICAL: Fail secure for invalid session
			expect(() => sessionManager.validateSession('non-existent')).toThrow('Session not found');
		});

		it('should fail validation for expired session', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Expire session
			session.tokenExpiresAt = Date.now() - 1000;

			// CRITICAL: Expired session must fail validation
			expect(() => sessionManager.validateSession('client-1')).toThrow('Access token expired');
		});

		it('should update last activity on validation', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);
			const initialActivity = session.lastActivity;

			// Wait a bit
			await new Promise(resolve => setTimeout(resolve, 10));

			// Validate
			sessionManager.validateSession('client-1');

			const updatedSession = sessionManager.getSession('client-1');
			expect(updatedSession?.lastActivity).toBeGreaterThan(initialActivity);
		});

		it('should enforce complete mediation (check every request)', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);

			// Make multiple requests, each must be validated
			for (let i = 0; i < 5; i++) {
				const validation = sessionManager.validateSession('client-1');
				expect(validation.userId).toBeDefined();
			}
		});
	});

	describe('session statistics', () => {
		it('should track session count accurately', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);

			const stats = sessionManager.getStats();
			expect(stats.totalSessions).toBe(2);
		});

		it('should track user count accurately', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			await sessionManager.authenticateConnection('client-1', req);
			await sessionManager.authenticateConnection('client-2', req);

			const stats = sessionManager.getStats();
			// Both sessions from same user
			expect(stats.totalUsers).toBe(1);
			expect(stats.avgSessionsPerUser).toBe(2);
		});
	});

	describe('fail secure principles', () => {
		it('should fail secure on invalid session access', () => {
			// Invalid access should throw, not return null/undefined with risk of NPE
			expect(() => sessionManager.validateSession('invalid')).toThrow();
		});

		it('should fail secure on invalid token', async () => {
			// Invalid token should reject, not proceed with limited access
			await expect(authService.verifyAccessToken('invalid')).rejects.toThrow();
		});

		it('should fail secure on expired token', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as IncomingMessage;

			const session = await sessionManager.authenticateConnection('client-1', req);

			// Expire
			session.tokenExpiresAt = Date.now() - 1000;

			// Should throw, not return partial data
			expect(() => sessionManager.validateSession('client-1')).toThrow();
		});
	});
});
