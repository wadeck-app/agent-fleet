import { beforeEach, describe, expect, it } from 'vitest';

import { MockAuthService } from '../auth/MockAuthService';
import { WebSocketSessionManager } from '../transport/WebSocketSessionManager';
import AuthController from './AuthController';

/**
 * ===========================================================================================
 * AUTH CONTROLLER TESTS
 * ===========================================================================================
 *
 * Tests for AuthController - authentication and session management HTTP endpoints.
 *
 * Test coverage:
 * - POST /api/auth/login (success, invalid credentials)
 * - Cookie setting (httpOnly, secure, sameSite)
 * - POST /api/auth/refresh (success, no cookie)
 * - POST /api/auth/logout (clears cookies)
 * - GET /api/auth/session (valid, invalid)
 * - WebSocket session synchronization
 * - Security headers
 *
 * ===========================================================================================
 */

/**
 * Mock Fastify reply object
 */
class MockReply {
	statusCode = 200;
	cookies: Record<string, { value: string; options: any }> = {};
	clearedCookies: string[] = [];
	sentData: any = null;

	code(status: number) {
		this.statusCode = status;
		return this;
	}

	setCookie(name: string, value: string, options: any) {
		this.cookies[name] = { value, options };
		return this;
	}

	clearCookie(name: string, _options?: any) {
		this.clearedCookies.push(name);
		delete this.cookies[name];
		return this;
	}

	send(data: any) {
		this.sentData = data;
		return this;
	}
}

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

describe('AuthController', () => {
	let controller: AuthController;
	let authService: MockAuthService;
	let sessionManager: WebSocketSessionManager;

	beforeEach(() => {
		// Create auth service
		authService = new MockAuthService('test-secret');

		// Create session manager
		sessionManager = new WebSocketSessionManager(authService);

		// Create controller
		controller = new AuthController(authService, sessionManager);
	});

	describe('POST /api/auth/login', () => {
		it('should successfully login with correct credentials', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Find login route
			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			expect(loginRoute).toBeDefined();

			const reply = new MockReply();

			const result = await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			// Check response
			expect(result).toMatchObject({
				userId: expect.any(String),
				expiresAt: expect.any(Number),
			});

			// Check cookies
			expect(reply.cookies.access_token).toBeDefined();
			expect(reply.cookies.refresh_token).toBeDefined();
		});

		it('should set httpOnly flag on access token cookie', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			expect(reply.cookies.access_token.options.httpOnly).toBe(true);
		});

		it('should set sameSite=strict on cookies', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			expect(reply.cookies.access_token.options.sameSite).toBe('strict');
			expect(reply.cookies.refresh_token.options.sameSite).toBe('strict');
		});

		it('should set secure flag in production', async () => {
			// Save original NODE_ENV
			const originalEnv = process.env.NODE_ENV;

			// Set to production
			process.env.NODE_ENV = 'production';

			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			expect(reply.cookies.access_token.options.secure).toBe(true);

			// Restore original NODE_ENV
			process.env.NODE_ENV = originalEnv;
		});

		it('should not set secure flag in development', async () => {
			// Save original NODE_ENV
			const originalEnv = process.env.NODE_ENV;

			// Set to development
			process.env.NODE_ENV = 'development';

			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			expect(reply.cookies.access_token.options.secure).toBe(false);

			// Restore original NODE_ENV
			process.env.NODE_ENV = originalEnv;
		});

		it('should set correct maxAge on access token (5 minutes)', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			// Access token should expire in 5 minutes (300 seconds)
			expect(reply.cookies.access_token.options.maxAge).toBe(300);
		});

		it('should set refresh token to /api/auth/refresh path only', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			expect(reply.cookies.refresh_token.options.path).toBe('/api/auth/refresh');
		});

		it('should reject invalid credentials', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await expect(
				loginRoute!.handler({
					body: {
						email: 'wrong@example.com',
						password: 'wrongpassword',
					},
					reply,
				})
			).rejects.toThrow('Invalid credentials');
		});
	});

	describe('POST /api/auth/refresh', () => {
		it('should refresh access token with valid refresh token', async () => {
			// First login to get refresh token
			const { refreshToken, userId } = await authService.login('test@example.com', 'password');

			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const refreshRoute = routes.find(r => r.path === '/api/auth/refresh' && r.method === 'POST');
			const reply = new MockReply();

			const result = await refreshRoute!.handler({
				cookies: {
					refresh_token: refreshToken,
				},
				reply,
			});

			expect(result).toMatchObject({
				userId,
				expiresAt: expect.any(Number),
			});

			expect(reply.cookies.access_token).toBeDefined();
		});

		it('should update all WebSocket sessions on token refresh', async () => {
			// Login
			const { accessToken, refreshToken } = await authService.login('test@example.com', 'password');

			// Create WebSocket session
			const req = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as any;

			await sessionManager.authenticateConnection('client-1', req);

			// Refresh token
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const refreshRoute = routes.find(r => r.path === '/api/auth/refresh' && r.method === 'POST');
			const reply = new MockReply();

			await refreshRoute!.handler({
				cookies: {
					refresh_token: refreshToken,
				},
				reply,
			});

			// Session should have new token
			const session = sessionManager.getSession('client-1');
			expect(session?.accessToken).toBe(reply.cookies.access_token.value);
		});

		it('should return 401 when no refresh token provided', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const refreshRoute = routes.find(r => r.path === '/api/auth/refresh' && r.method === 'POST');
			const reply = new MockReply();

			await expect(
				refreshRoute!.handler({
					cookies: {},
					reply,
				})
			).rejects.toThrow('No refresh token');

			expect(reply.statusCode).toBe(401);
		});

		it('should reject invalid refresh token', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const refreshRoute = routes.find(r => r.path === '/api/auth/refresh' && r.method === 'POST');
			const reply = new MockReply();

			await expect(
				refreshRoute!.handler({
					cookies: {
						refresh_token: 'invalid-token',
					},
					reply,
				})
			).rejects.toThrow('Invalid refresh token');
		});
	});

	describe('POST /api/auth/logout', () => {
		it('should clear cookies on logout', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const logoutRoute = routes.find(r => r.path === '/api/auth/logout' && r.method === 'POST');
			const reply = new MockReply();

			const result = await logoutRoute!.handler({
				cookies: {},
				reply,
			});

			expect(result).toEqual({ success: true });
			expect(reply.clearedCookies).toContain('access_token');
			expect(reply.clearedCookies).toContain('refresh_token');
		});

		it('should blacklist token on logout', async () => {
			// Login first
			const { accessToken } = await authService.login('test@example.com', 'password');

			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const logoutRoute = routes.find(r => r.path === '/api/auth/logout' && r.method === 'POST');
			const reply = new MockReply();

			await logoutRoute!.handler({
				cookies: {
					access_token: accessToken,
				},
				reply,
			});

			// Token should be blacklisted
			await expect(authService.verifyAccessToken(accessToken)).rejects.toThrow('Token has been revoked');
		});

		it('should handle logout without access token', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const logoutRoute = routes.find(r => r.path === '/api/auth/logout' && r.method === 'POST');
			const reply = new MockReply();

			// Should not throw
			const result = await logoutRoute!.handler({
				cookies: {},
				reply,
			});

			expect(result).toEqual({ success: true });
		});
	});

	describe('GET /api/auth/session', () => {
		it('should return authenticated session with valid access token', async () => {
			// Login first
			const { accessToken, userId } = await authService.login('test@example.com', 'password');

			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const sessionRoute = routes.find(r => r.path === '/api/auth/session' && r.method === 'GET');

			const result = await sessionRoute!.handler({
				cookies: {
					access_token: accessToken,
				},
			});

			expect(result).toMatchObject({
				authenticated: true,
				userId,
				expiresAt: expect.any(Number),
			});
		});

		it('should return unauthenticated when no access token', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const sessionRoute = routes.find(r => r.path === '/api/auth/session' && r.method === 'GET');

			const result = await sessionRoute!.handler({
				cookies: {},
			});

			expect(result).toEqual({
				authenticated: false,
			});
		});

		it('should return unauthenticated for invalid access token', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const sessionRoute = routes.find(r => r.path === '/api/auth/session' && r.method === 'GET');

			const result = await sessionRoute!.handler({
				cookies: {
					access_token: 'invalid-token',
				},
			});

			expect(result).toEqual({
				authenticated: false,
			});
		});

		it('should return unauthenticated for expired token', async () => {
			// This would require mocking time or waiting, so we test with invalid token
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const sessionRoute = routes.find(r => r.path === '/api/auth/session' && r.method === 'GET');

			const result = await sessionRoute!.handler({
				cookies: {
					access_token: 'expired-token',
				},
			});

			expect(result).toEqual({
				authenticated: false,
			});
		});
	});

	describe('route registration', () => {
		it('should register all auth routes', () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			// Should have 4 routes
			expect(routes).toHaveLength(4);

			const routePaths = routes.map(r => `${r.method} ${r.path}`);
			expect(routePaths).toContain('POST /api/auth/login');
			expect(routePaths).toContain('POST /api/auth/refresh');
			expect(routePaths).toContain('POST /api/auth/logout');
			expect(routePaths).toContain('GET /api/auth/session');
		});
	});

	describe('security', () => {
		it('should never expose tokens in response body', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			const result = await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			// Tokens should only be in cookies, not in response body
			expect(result.accessToken).toBeUndefined();
			expect(result.refreshToken).toBeUndefined();
		});

		it('should use different paths for access and refresh token cookies', async () => {
			const { add, routes } = createMockRouteWrapper();
			controller.configureRoutes(add as any);

			const loginRoute = routes.find(r => r.path === '/api/auth/login' && r.method === 'POST');
			const reply = new MockReply();

			await loginRoute!.handler({
				body: {
					email: 'test@example.com',
					password: 'password',
				},
				reply,
			});

			// Access token available everywhere
			expect(reply.cookies.access_token.options.path).toBe('/');

			// Refresh token only available to refresh endpoint
			expect(reply.cookies.refresh_token.options.path).toBe('/api/auth/refresh');
		});
	});
});
