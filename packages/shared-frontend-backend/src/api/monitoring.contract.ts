import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * ===========================================================================================
 * MONITORING API CONTRACT
 * ===========================================================================================
 *
 * Type-safe monitoring API routes using Zod schemas.
 * This contract is shared between frontend and backend for perfect type safety.
 *
 * Endpoints:
 * - GET /api/monitoring/transport/health - Transport health check
 * - GET /api/monitoring/transport/stats - Transport server statistics
 * - GET /api/monitoring/transport/sessions - Active sessions (ADMIN only)
 *
 * ===========================================================================================
 */

/**
 * Health check response schema
 */
export const HealthResponseSchema = z.object({
	transport: z.enum(['ok', 'error']),
	auth: z.enum(['ok', 'error']),
	connectedClients: z.number(),
	uptime: z.number(), // Server uptime in milliseconds
	timestamp: z.number(), // Current timestamp
});

/**
 * Subscription breakdown schema
 */
export const SubscriptionBreakdownSchema = z.record(z.string(), z.number());

/**
 * Transport statistics response schema
 */
export const TransportStatsResponseSchema = z.object({
	connectedClients: z.number(),
	totalUsers: z.number(),
	avgSessionsPerUser: z.number(),
	subscriptions: SubscriptionBreakdownSchema, // eventType -> count
	uptime: z.number(), // Server uptime in milliseconds
	timestamp: z.number(),
});

/**
 * Session info schema (for ADMIN endpoint)
 */
export const SessionInfoSchema = z.object({
	clientId: z.string(),
	userId: z.string(),
	createdAt: z.number(),
	lastActivity: z.number(),
	tokenExpiresAt: z.number(),
	subscribedEvents: z.array(z.string()),
});

/**
 * Sessions list response schema
 */
export const SessionsResponseSchema = z.object({
	sessions: z.array(SessionInfoSchema),
	totalSessions: z.number(),
	totalUsers: z.number(),
	timestamp: z.number(),
});

/**
 * Infer TypeScript types from schemas
 */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type TransportStatsResponse = z.infer<typeof TransportStatsResponseSchema>;
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;
export type SubscriptionBreakdown = z.infer<typeof SubscriptionBreakdownSchema>;

/**
 * Monitoring API routes
 * Note: Routes must be ordered from shortest to longest path to satisfy route-builder validation
 */
export const MONITORING_API_ROUTES = defineRoutes({
	'/api/monitoring/transport/stats': {
		GET: {
			response: TransportStatsResponseSchema,
		},
	},
	'/api/monitoring/transport/health': {
		GET: {
			response: HealthResponseSchema,
		},
	},
	'/api/monitoring/transport/sessions': {
		GET: {
			response: SessionsResponseSchema,
		},
	},
});

export type MonitoringApiRoutes = typeof MONITORING_API_ROUTES;
