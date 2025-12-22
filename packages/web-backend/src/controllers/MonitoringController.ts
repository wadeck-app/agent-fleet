import type { MONITORING_API_ROUTES } from '@app/shared';
import { MONITORING_API_ROUTES as routes } from '@app/shared';

import type { ITransportServer } from '../transport/ITransportServer';
import type { WebSocketSessionManager } from '../transport/WebSocketSessionManager';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * MONITORING CONTROLLER - TRANSPORT LAYER MONITORING
 * ===========================================================================================
 *
 * Presentation layer for monitoring endpoints.
 * Responsibilities:
 * - HTTP request/response handling for monitoring endpoints
 * - Health checks (no auth required)
 * - Statistics endpoint (no auth required)
 * - Sessions endpoint (auth required - checks userId in request)
 * - Input validation (via Zod schemas in monitoring.contract.ts)
 *
 * Security:
 * - Health endpoint: Public (no auth)
 * - Stats endpoint: Public (no auth) - only aggregated data
 * - Sessions endpoint: Authenticated users only (returns empty for non-authenticated)
 *
 * Does NOT contain:
 * - Business logic (delegates to TransportServer and SessionManager)
 * - Data storage (in-memory session management)
 *
 * ===========================================================================================
 */
export default class MonitoringController implements LazyController<typeof MONITORING_API_ROUTES> {
	static routes = routes;

	private startTime: number;

	constructor(
		private readonly transportServer: ITransportServer,
		private readonly sessionManager: WebSocketSessionManager
	) {
		this.startTime = Date.now();
	}

	configureRoutes(add: RouteWrapperFunc<typeof MONITORING_API_ROUTES>) {
		/**
		 * GET /api/monitoring/transport/health
		 * Health check endpoint - no auth required
		 * Returns transport and auth service health status
		 */
		add('GET', '/api/monitoring/transport/health', async () => {
			const connectedClients = this.transportServer.getConnectedClients().length;
			const uptime = Date.now() - this.startTime;

			// Simple health check: if we can get stats, services are healthy
			let transportHealth: 'ok' | 'error' = 'ok';
			let authHealth: 'ok' | 'error' = 'ok';

			try {
				this.sessionManager.getStats();
			} catch (error) {
				console.error('[Monitoring] Health check failed:', error);
				transportHealth = 'error';
				authHealth = 'error';
			}

			return {
				transport: transportHealth,
				auth: authHealth,
				connectedClients,
				uptime,
				timestamp: Date.now(),
			};
		});

		/**
		 * GET /api/monitoring/transport/stats
		 * Get transport server statistics - no auth required
		 * Returns aggregated statistics (no sensitive data)
		 */
		add('GET', '/api/monitoring/transport/stats', async () => {
			const stats = this.sessionManager.getStats();
			const connectedClients = this.transportServer.getConnectedClients();
			const uptime = Date.now() - this.startTime;

			// Calculate subscription breakdown
			const subscriptions: Record<string, number> = {};

			connectedClients.forEach(clientId => {
				const clientSubscriptions = this.sessionManager.getSubscriptions(clientId);
				clientSubscriptions.forEach(eventType => {
					subscriptions[eventType] = (subscriptions[eventType] || 0) + 1;
				});
			});

			return {
				connectedClients: stats.totalSessions,
				totalUsers: stats.totalUsers,
				avgSessionsPerUser: stats.avgSessionsPerUser,
				subscriptions,
				uptime,
				timestamp: Date.now(),
			};
		});

		/**
		 * GET /api/monitoring/transport/sessions
		 * Get all active sessions - auth required
		 * Returns detailed session information for authenticated users
		 *
		 * Note: In a real application, this would be restricted to ADMIN role.
		 * For now, we check if userId exists in request (set by auth middleware).
		 */
		add('GET', '/api/monitoring/transport/sessions', async ({ request }) => {
			// Check if user is authenticated
			// The userId is set by TransportRouter when handling WebSocket requests
			// or by auth middleware for HTTP requests
			const userId = (request as any).userId;

			if (!userId) {
				// Return empty sessions for non-authenticated users
				// In production, you might want to throw 401 or 403
				return {
					sessions: [],
					totalSessions: 0,
					totalUsers: 0,
					timestamp: Date.now(),
				};
			}

			// Get all active sessions
			const connectedClients = this.transportServer.getConnectedClients();
			const sessions = connectedClients
				.map(clientId => {
					const session = this.sessionManager.getSession(clientId);
					if (!session) return null;

					return {
						clientId: session.clientId,
						userId: session.userId,
						createdAt: session.createdAt,
						lastActivity: session.lastActivity,
						tokenExpiresAt: session.tokenExpiresAt,
						subscribedEvents: Array.from(session.subscribedEvents),
					};
				})
				.filter(session => session !== null);

			const stats = this.sessionManager.getStats();

			return {
				sessions,
				totalSessions: stats.totalSessions,
				totalUsers: stats.totalUsers,
				timestamp: Date.now(),
			};
		});
	}
}
