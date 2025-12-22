import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from './MockAuthService';

/**
 * ===========================================================================================
 * MOCK AUTH SERVICE TESTS
 * ===========================================================================================
 *
 * Tests for JWT-based authentication service with in-memory token blacklist.
 *
 * Coverage:
 * - Login with valid/invalid credentials
 * - Access token generation and verification
 * - Refresh token generation and verification
 * - Token blacklisting (logout)
 * - Token expiration
 * - Invalid token types
 *
 * ===========================================================================================
 */

describe('MockAuthService', () => {
	let authService: MockAuthService;
	const testSecret = 'test-secret-key';

	beforeEach(() => {
		authService = new MockAuthService(testSecret);
	});

	afterEach(() => {
		// Cleanup any timers
		authService.destroy?.();
	});

	describe('login', () => {
		it('should successfully login with correct credentials', async () => {
			const result = await authService.login('test@example.com', 'password');

			expect(result).toMatchObject({
				userId: 'test-user-123',
				expiresIn: 300, // 5 minutes
			});
			expect(result.accessToken).toBeTruthy();
			expect(result.refreshToken).toBeTruthy();
			expect(typeof result.accessToken).toBe('string');
			expect(typeof result.refreshToken).toBe('string');
		});

		it('should reject login with wrong email', async () => {
			await expect(authService.login('wrong@example.com', 'password')).rejects.toThrow('Invalid credentials');
		});

		it('should reject login with wrong password', async () => {
			await expect(authService.login('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials');
		});

		it('should reject login with empty credentials', async () => {
			await expect(authService.login('', '')).rejects.toThrow('Invalid credentials');
		});
	});

	describe('verifyAccessToken', () => {
		it('should verify valid access token', async () => {
			// Generate token
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			// Verify token
			const payload = await authService.verifyAccessToken(accessToken);

			expect(payload).toMatchObject({
				userId,
			});
			expect(payload.expiresAt).toBeGreaterThan(Date.now());
		});

		it('should reject invalid token', async () => {
			await expect(authService.verifyAccessToken('invalid-token')).rejects.toThrow('Invalid access token');
		});

		it('should reject empty token', async () => {
			await expect(authService.verifyAccessToken('')).rejects.toThrow('Invalid access token');
		});

		it('should reject refresh token as access token', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			await expect(authService.verifyAccessToken(refreshToken)).rejects.toThrow('Invalid token type');
		});

		it('should reject blacklisted token', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Verify it works first
			await authService.verifyAccessToken(accessToken);

			// Blacklist it
			authService.blacklistToken(accessToken);

			// Should now be rejected
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});
	});

	describe('refreshToken', () => {
		it('should refresh access token with valid refresh token', async () => {
			// Login to get refresh token
			const { refreshToken: originalRefreshToken, userId } = await authService.login(
				'test@example.com',
				'password'
			);

			// Refresh access token
			const result = await authService.refreshToken(originalRefreshToken);

			expect(result).toMatchObject({
				userId,
				expiresIn: 300, // 5 minutes
			});
			expect(result.accessToken).toBeTruthy();
			expect(typeof result.accessToken).toBe('string');

			// New access token should be valid
			const payload = await authService.verifyAccessToken(result.accessToken);
			expect(payload.userId).toBe(userId);
		});

		it('should reject invalid refresh token', async () => {
			await expect(authService.refreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
		});

		it('should reject access token as refresh token', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			await expect(authService.refreshToken(accessToken)).rejects.toThrow('Invalid token type');
		});

		it('should reject blacklisted refresh token', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Blacklist it
			authService.blacklistToken(refreshToken);

			// Should be rejected
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});
	});

	describe('logout', () => {
		it('should logout user successfully', async () => {
			const { userId } = await authService.login('test@example.com', 'password');

			await expect(authService.logout(userId)).resolves.not.toThrow();
		});

		it('should handle logout for non-existent user', async () => {
			await expect(authService.logout('non-existent-user')).resolves.not.toThrow();
		});
	});

	describe('token blacklisting', () => {
		it('should blacklist access token', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			// Verify token works
			await authService.verifyAccessToken(accessToken);

			// Blacklist it
			authService.blacklistToken(accessToken);

			// Should be rejected
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});

		it('should blacklist refresh token', async () => {
			const { refreshToken } = await authService.login('test@example.com', 'password');

			// Verify token works
			await authService.refreshToken(refreshToken);

			// Blacklist it
			authService.blacklistToken(refreshToken);

			// Should be rejected
			await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Refresh token has been revoked');
		});
	});

	describe('statistics', () => {
		it('should return stats with blacklisted token count', async () => {
			const { accessToken } = await authService.login('test@example.com', 'password');

			const statsBefore = authService.getStats();
			expect(statsBefore.blacklistedTokens).toBe(0);

			authService.blacklistToken(accessToken);

			const statsAfter = authService.getStats();
			expect(statsAfter.blacklistedTokens).toBe(1);
		});
	});

	describe('token structure', () => {
		it('should generate tokens with proper claims', async () => {
			const { accessToken, refreshToken, userId } = await authService.login('test@example.com', 'password');

			// Verify access token structure
			const accessPayload = await authService.verifyAccessToken(accessToken);
			expect(accessPayload.userId).toBe(userId);
			expect(accessPayload.expiresAt).toBeGreaterThan(Date.now());

			// Verify refresh token can generate new access token
			const refreshResult = await authService.refreshToken(refreshToken);
			expect(refreshResult.userId).toBe(userId);
			expect(refreshResult.accessToken).toBeTruthy();
		});
	});
});
