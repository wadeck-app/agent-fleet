/**
 * TokenRefreshManager Tests
 *
 * Tests for automatic token refresh functionality including:
 * - Auto-refresh scheduling
 * - Manual refresh
 * - Callback invocation
 * - Concurrent refresh prevention
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TokenRefreshConfig, TokenRefreshManager } from './TokenRefreshManager';

describe('TokenRefreshManager', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn();
		global.fetch = fetchMock as any;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('constructor', () => {
		it('should create instance with config', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);
			expect(manager).toBeInstanceOf(TokenRefreshManager);
		});
	});

	describe('startAutoRefresh', () => {
		it('should schedule refresh before expiry', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000, // 1 minute
			};

			const manager = new TokenRefreshManager(config);

			const expiresAt = Date.now() + 300000; // 5 minutes from now
			manager.startAutoRefresh(expiresAt);

			expect(manager.isAutoRefreshActive()).toBe(true);
		});

		it('should cancel previous refresh when called again', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);

			manager.startAutoRefresh(Date.now() + 300000);
			expect(manager.isAutoRefreshActive()).toBe(true);

			manager.startAutoRefresh(Date.now() + 400000);
			expect(manager.isAutoRefreshActive()).toBe(true);
		});

		it('should schedule refresh at correct time', async () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000, // Refresh 1 minute before
			};

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ expiresAt: Date.now() + 300000 }),
			});

			const manager = new TokenRefreshManager(config);

			const expiresAt = Date.now() + 300000; // Expires in 5 minutes
			manager.startAutoRefresh(expiresAt);

			// Should not refresh yet (scheduled for 4 minutes = 240000ms)
			await vi.advanceTimersByTimeAsync(200000);
			expect(fetchMock).not.toHaveBeenCalled();

			// Should refresh after 4 minutes
			await vi.advanceTimersByTimeAsync(50000);
			expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
				method: 'POST',
				credentials: 'include',
			});
		});
	});

	describe('stopAutoRefresh', () => {
		it('should cancel scheduled refresh', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);

			manager.startAutoRefresh(Date.now() + 300000);
			expect(manager.isAutoRefreshActive()).toBe(true);

			manager.stopAutoRefresh();
			expect(manager.isAutoRefreshActive()).toBe(false);
		});

		it('should be safe to call when not active', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);

			expect(() => manager.stopAutoRefresh()).not.toThrow();
		});
	});

	describe('refreshToken', () => {
		it('should refresh token successfully', async () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const newExpiresAt = Date.now() + 300000;
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ expiresAt: newExpiresAt }),
			});

			const manager = new TokenRefreshManager(config);

			const result = await manager.refreshToken();

			expect(result.expiresAt).toBe(newExpiresAt);
			expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
				method: 'POST',
				credentials: 'include',
			});
		});

		it('should call onRefreshSuccess callback', async () => {
			const onRefreshSuccess = vi.fn();
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
				onRefreshSuccess,
			};

			const newExpiresAt = Date.now() + 300000;
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ expiresAt: newExpiresAt }),
			});

			const manager = new TokenRefreshManager(config);

			await manager.refreshToken();

			expect(onRefreshSuccess).toHaveBeenCalledWith(newExpiresAt);
		});

		it('should call onRefreshFailed callback on error', async () => {
			const onRefreshFailed = vi.fn();
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
				onRefreshFailed,
			};

			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 401,
			});

			const manager = new TokenRefreshManager(config);

			await expect(manager.refreshToken()).rejects.toThrow('Token refresh failed: 401');
			expect(onRefreshFailed).toHaveBeenCalled();
		});

		it('should prevent concurrent refresh attempts', async () => {
			// Use real timers for this test since we need actual async behavior
			vi.useRealTimers();

			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			fetchMock.mockImplementation(
				() =>
					new Promise(resolve =>
						setTimeout(
							() =>
								resolve({
									ok: true,
									json: async () => ({ expiresAt: Date.now() + 300000 }),
								}),
							100
						)
					)
			);

			const manager = new TokenRefreshManager(config);

			const promise1 = manager.refreshToken();
			const promise2 = manager.refreshToken();

			const [_result1, result2] = await Promise.all([promise1, promise2]);

			// Second call should return early
			expect(result2.expiresAt).toBe(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Restore fake timers for other tests
			vi.useFakeTimers();
		});

		it('should reschedule after successful refresh', async () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const newExpiresAt = Date.now() + 300000;
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ expiresAt: newExpiresAt }),
			});

			const manager = new TokenRefreshManager(config);

			await manager.refreshToken();

			expect(manager.isAutoRefreshActive()).toBe(true);
		});
	});

	describe('isCurrentlyRefreshing', () => {
		it('should return false when not refreshing', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);
			expect(manager.isCurrentlyRefreshing()).toBe(false);
		});

		it('should return true during refresh', async () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			let resolveRefresh: (value: any) => void;
			fetchMock.mockImplementation(
				() =>
					new Promise(resolve => {
						resolveRefresh = resolve;
					})
			);

			const manager = new TokenRefreshManager(config);

			const refreshPromise = manager.refreshToken();
			expect(manager.isCurrentlyRefreshing()).toBe(true);

			resolveRefresh!({
				ok: true,
				json: async () => ({ expiresAt: Date.now() + 300000 }),
			});

			await refreshPromise;
			expect(manager.isCurrentlyRefreshing()).toBe(false);
		});
	});

	describe('isAutoRefreshActive', () => {
		it('should return false initially', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);
			expect(manager.isAutoRefreshActive()).toBe(false);
		});

		it('should return true when refresh is scheduled', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);
			manager.startAutoRefresh(Date.now() + 300000);

			expect(manager.isAutoRefreshActive()).toBe(true);
		});

		it('should return false after stopping', () => {
			const config: TokenRefreshConfig = {
				refreshEndpoint: '/api/auth/refresh',
				refreshBeforeExpiry: 60000,
			};

			const manager = new TokenRefreshManager(config);
			manager.startAutoRefresh(Date.now() + 300000);
			manager.stopAutoRefresh();

			expect(manager.isAutoRefreshActive()).toBe(false);
		});
	});
});
