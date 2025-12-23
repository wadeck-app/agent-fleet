import type { AUTH_API_ROUTES } from '@app/shared';
import { AUTH_API_ROUTES as routes } from '@app/shared';

import type { AuthService } from '../auth/AuthService';
import type { MockAuthService } from '../auth/MockAuthService';
import type { WebSocketSessionManager } from '../transport/WebSocketSessionManager';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * AUTH CONTROLLER - AUTHENTICATION & SESSION MANAGEMENT
 * ===========================================================================================
 *
 * Presentation layer for authentication.
 * Responsibilities:
 * - HTTP request/response handling for auth endpoints
 * - Cookie management (HTTP_ONLY cookies for security)
 * - WebSocket session synchronization (refresh updates all WS sessions)
 * - Input validation (via Zod schemas in auth.contract.ts)
 * - Delegate to AuthService for authentication logic
 *
 * Security features:
 * - HTTP_ONLY cookies (tokens not accessible via JavaScript)
 * - SameSite=strict (CSRF protection)
 * - Secure flag in production (HTTPS only)
 * - Automatic WebSocket session updates on token refresh
 *
 * Does NOT contain:
 * - Authentication logic (in AuthService)
 * - Token generation/validation (in AuthService)
 * - WebSocket session management (in WebSocketSessionManager)
 *
 * ===========================================================================================
 */
export default class AuthController implements LazyController<typeof AUTH_API_ROUTES> {
	static routes = routes;

	constructor(
		private readonly authService: AuthService,
		private readonly sessionManager: WebSocketSessionManager
	) {}

	configureRoutes(add: RouteWrapperFunc<typeof AUTH_API_ROUTES>) {
		/**
		 * POST /api/auth/login
		 * Login with email/password, set HTTP_ONLY cookies
		 */
		add('POST', '/api/auth/login', async ({ body, reply }) => {
			const { email, password } = body;

			// Authenticate user
			const { userId, accessToken, refreshToken, expiresIn } = await this.authService.login(email, password);

			// Set HTTP_ONLY cookies (CRITICAL: httpOnly + secure + sameSite)
			const isProduction = process.env.NODE_ENV === 'production';

			reply.setCookie('access_token', accessToken, {
				httpOnly: true, // Not accessible via JavaScript (XSS protection)
				secure: isProduction, // HTTPS only in production
				sameSite: 'strict', // CSRF protection
				path: '/',
				maxAge: expiresIn, // 5 minutes
			});

			reply.setCookie('refresh_token', refreshToken, {
				httpOnly: true,
				secure: isProduction,
				sameSite: 'strict',
				path: '/api/auth/refresh', // Only sent to refresh endpoint
				maxAge: 7 * 24 * 60 * 60, // 7 days
			});

			console.log(`[Auth] User ${userId} logged in`);

			return {
				userId,
				expiresAt: Date.now() + expiresIn * 1000,
			};
		});

		/**
		 * POST /api/auth/refresh
		 * Refresh access token using refresh token
		 * CRITICAL: Also updates ALL WebSocket sessions for this user
		 */
		add('POST', '/api/auth/refresh', async ({ cookies, reply }) => {
			const refreshToken = cookies.refresh_token;

			if (!refreshToken) {
				reply.code(401);
				throw new Error('No refresh token');
			}

			// Refresh access token
			const { userId, accessToken, expiresIn } = await this.authService.refreshToken(refreshToken);

			// Update HTTP_ONLY cookie
			const isProduction = process.env.NODE_ENV === 'production';

			reply.setCookie('access_token', accessToken, {
				httpOnly: true,
				secure: isProduction,
				sameSite: 'strict',
				path: '/',
				maxAge: expiresIn,
			});

			// CRITICAL: Update ALL WebSocket sessions for this user
			// This ensures all connected devices get the new token without reconnecting
			await this.sessionManager.refreshSessionToken(userId, accessToken);

			console.log(`[Auth] Token refreshed for user ${userId}`);

			return {
				userId,
				expiresAt: Date.now() + expiresIn * 1000,
			};
		});

		/**
		 * POST /api/auth/logout
		 * Logout user, clear cookies
		 */
		add('POST', '/api/auth/logout', async ({ cookies, reply }) => {
			const accessToken = cookies.access_token;

			// Blacklist the token if using MockAuthService
			if (accessToken && 'blacklistToken' in this.authService) {
				(this.authService as MockAuthService).blacklistToken(accessToken);
			}

			// Clear HTTP_ONLY cookies
			reply.clearCookie('access_token', { path: '/' });
			reply.clearCookie('refresh_token', { path: '/api/auth/refresh' });

			// Note: WebSocket connections will be closed automatically when token expires
			// or when client receives logout confirmation

			console.log('[Auth] User logged out');

			return { success: true };
		});

		/**
		 * GET /api/auth/session
		 * Check current session status
		 * Used by frontend to verify authentication state
		 */
		add('GET', '/api/auth/session', async ({ cookies }) => {
			// DEVELOPMENT ONLY: Bypass authentication if DISABLE_AUTH_DEV=true
			// This allows frontend development without authentication blocking
			// NEVER use this in production!
			const disableAuthDev = process.env.DISABLE_AUTH_DEV === 'true';

			// SECURITY: Double-check we're not in production
			// This prevents bypass if someone removes the startup check
			if (disableAuthDev) {
				if (process.env.NODE_ENV === 'production') {
					console.error('[Auth] FATAL: DISABLE_AUTH_DEV=true detected in production!');
					throw new Error('Authentication bypass not allowed in production');
				}

				const mockUserId = 'dev-user-no-auth';
				// Set expiration far in the future (1 year)
				const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

				console.log('[Auth] DEVELOPMENT MODE: Session check bypassed, returning authenticated');

				return {
					authenticated: true,
					userId: mockUserId,
					expiresAt,
				};
			}

			const accessToken = cookies.access_token;

			if (!accessToken) {
				return {
					authenticated: false,
				};
			}

			try {
				const { userId, expiresAt } = await this.authService.verifyAccessToken(accessToken);
				return {
					authenticated: true,
					userId,
					expiresAt,
				};
			} catch (_error) {
				// Token invalid or expired
				return {
					authenticated: false,
				};
			}
		});
	}
}
