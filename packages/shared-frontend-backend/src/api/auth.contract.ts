import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * ===========================================================================================
 * AUTHENTICATION API CONTRACT
 * ===========================================================================================
 *
 * Type-safe authentication API routes using Zod schemas.
 * This contract is shared between frontend and backend for perfect type safety.
 *
 * Endpoints:
 * - POST /api/auth/login - Login with email/password (sets HTTP_ONLY cookies)
 * - POST /api/auth/refresh - Refresh access token (updates cookies + WS sessions)
 * - POST /api/auth/logout - Logout (clears cookies)
 * - GET /api/auth/session - Check current session status
 *
 * Security:
 * - Tokens stored in HTTP_ONLY cookies (not accessible via JavaScript)
 * - SameSite=strict for CSRF protection
 * - Secure flag in production (HTTPS only)
 *
 * ===========================================================================================
 */

/**
 * Login request schema
 */
export const LoginRequestSchema = z.object({
	email: z.string().email('Invalid email format'),
	password: z.string().min(1, 'Password is required'),
});

/**
 * Login response schema
 * Note: Tokens are in HTTP_ONLY cookies, not in response body
 */
export const LoginResponseSchema = z.object({
	userId: z.string(),
	expiresAt: z.number(), // Timestamp in milliseconds
});

/**
 * Refresh token response schema
 * Note: New access token is in HTTP_ONLY cookie, not in response body
 */
export const RefreshTokenResponseSchema = z.object({
	userId: z.string(),
	expiresAt: z.number(), // Timestamp in milliseconds
});

/**
 * Logout response schema
 */
export const LogoutResponseSchema = z.object({
	success: z.boolean(),
});

/**
 * Session response schema
 */
export const SessionResponseSchema = z.object({
	authenticated: z.boolean(),
	userId: z.string().optional(),
	expiresAt: z.number().optional(), // Timestamp in milliseconds
});

/**
 * Infer TypeScript types from schemas
 */
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * Authentication API routes
 */
export const AUTH_API_ROUTES = defineRoutes({
	'/api/auth/login': {
		POST: {
			body: LoginRequestSchema,
			response: LoginResponseSchema,
		},
	},
	'/api/auth/refresh': {
		POST: {
			response: RefreshTokenResponseSchema,
		},
	},
	'/api/auth/logout': {
		POST: {
			response: LogoutResponseSchema,
		},
	},
	'/api/auth/session': {
		GET: {
			response: SessionResponseSchema,
		},
	},
});

export type AuthApiRoutes = typeof AUTH_API_ROUTES;
