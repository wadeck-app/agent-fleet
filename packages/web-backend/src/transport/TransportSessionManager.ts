/**
 * ===========================================================================================
 * TRANSPORT SESSION MANAGER - CORE SECURITY FOR TRANSPORT LAYER
 * ===========================================================================================
 *
 * Manages sessions for all transport types with unified authentication
 * and subscription tracking. This is the critical security component that bridges
 * HTTP authentication and real-time connections (WebSocket, SSE, Long Polling, HTTP).
 *
 * Features:
 * - Parse HTTP_ONLY cookies from connection upgrade request
 * - Authenticate connections using AuthService
 * - Track session info (userId, token, expiration)
 * - Multi-device support (multiple connIds per userId)
 * - Fast session validation (only expiry check, no full token verification)
 * - Automatic session cleanup (expired sessions removed every minute)
 * - Subscription tracking (which events each client subscribed to)
 * - Transport type detection and tracking (WebSocket, SSE, Long Polling, HTTP, Mock)
 *
 * Security flow:
 * 1. Connection upgrade → Parse cookies from HTTP headers
 * 2. Validate access_token using AuthService
 * 3. Create session in memory (connId → userId + token + expiry + transportType)
 * 4. Each request → Fast validation (check expiry only)
 * 5. HTTP token refresh → Update ALL sessions for that user
 *
 * Anti-fragility:
 * - Each transport type is independent
 * - Failure in one transport doesn't affect others
 * - Graceful degradation if transport fails
 * - No shared mutable state between transports
 *
 * ===========================================================================================
 */
import cookie from 'cookie';
import type { IncomingMessage } from 'http';
import { createLogger } from 'shared-common/logger';

import type { TransportType } from '@app/shared/transport';

import type { AuthService } from '../auth/AuthService';

const log = createLogger('TransportSessionManager');

/**
 * Base session data
 */
export interface BaseSession {
	connId: string;
	userId: string;
	accessToken: string;
	tokenExpiresAt: number;
	createdAt: number;
	lastActivity: number;
	// Track which events this client is subscribed to
	subscribedEvents: Set<string>;
	// Track filters for each event (event → filters)
	eventFilters: Map<string, Record<string, unknown>>;
}

/**
 * Transport session data
 * Extends base session with transport type
 */
export interface TransportSession extends BaseSession {
	/** Type of transport used by this client */
	transportType: TransportType;
}

/**
 * Session statistics
 */
export interface SessionStats {
	totalSessions: number;
	totalUsers: number;
	avgSessionsPerUser: number;
}

/**
 * Transport session statistics
 */
export interface TransportSessionStats {
	/** Total active sessions */
	totalSessions: number;
	/** Total unique users */
	totalUsers: number;
	/** Average sessions per user */
	avgSessionsPerUser: number;
	/** Sessions by transport type */
	byTransportType: {
		websocket: number;
		sse: number;
		'long-polling': number;
		http: number;
		mock: number;
	};
}

/**
 * Transport Session Manager
 *
 * Manages sessions for all transport types with unified authentication
 * and subscription tracking.
 *
 * @example
 * ```typescript
 * const manager = new TransportSessionManager(authService);
 *
 * // WebSocket connection
 * const wsSession = await manager.authenticateConnection('conn-1', request, 'websocket');
 *
 * // SSE connection
 * const sseSession = await manager.authenticateConnection('conn-2', request, 'sse');
 *
 * // Get transport type for a connection
 * const type = manager.getTransportType('conn-1'); // 'websocket'
 *
 * // Cleanup
 * manager.shutdown();
 * ```
 */
export class TransportSessionManager {
	// connId → session info
	private sessions = new Map<string, BaseSession>();

	// userId → Set of connIds (multi-device support)
	private userSessions = new Map<string, Set<string>>();

	// connId → transport type
	private transportTypes = new Map<string, TransportType>();

	// Cleanup timer
	private cleanupTimer?: NodeJS.Timeout;

	constructor(private authService: AuthService) {
		// Cleanup expired sessions every minute
		this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 60000);
	}

	/**
	 * Authenticate connection with transport type
	 *
	 * Called during connection upgrade (GET /ws, GET /sse, POST /long-polling, etc.)
	 *
	 * @param connId - Unique connection ID for this connection
	 * @param request - HTTP upgrade request containing cookies
	 * @param transportType - Type of transport (websocket, sse, long-polling). Defaults to 'websocket' for backward compatibility.
	 * @returns Transport session
	 * @throws Error if authentication fails
	 */
	async authenticateConnection(
		connId: string,
		request: IncomingMessage,
		transportType: TransportType = 'websocket'
	): Promise<TransportSession> {
		// Check if session already exists (reconnection scenario)
		// Preserve subscriptions and filters to avoid losing them on rapid reconnects
		const existingSession = this.sessions.get(connId);
		const existingSubscriptions = existingSession?.subscribedEvents || new Set();
		const existingFilters = existingSession?.eventFilters || new Map();
		const isReconnection = existingSession !== undefined;

		// DEVELOPMENT ONLY: Bypass authentication if DISABLE_AUTH_DEV=true
		// This allows frontend development without authentication blocking
		// NEVER use this in production!
		const disableAuthDev = process.env.DISABLE_AUTH_DEV === 'true';

		// SECURITY: Double-check we're not in production
		// This prevents bypass if someone removes the startup check
		if (disableAuthDev) {
			if (process.env.NODE_ENV === 'production') {
				log.error('FATAL: DISABLE_AUTH_DEV=true detected in production!');
				throw new Error('Connection authentication bypass not allowed in production');
			}

			const mockUserId = 'dev-user-no-auth';
			const mockToken = 'dev-bypass-token';
			// Set expiration far in the future (1 year)
			const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

			const baseSession: BaseSession = {
				connId,
				userId: mockUserId,
				accessToken: mockToken,
				tokenExpiresAt: expiresAt,
				createdAt: Date.now(),
				lastActivity: Date.now(),
				subscribedEvents: existingSubscriptions,
				eventFilters: existingFilters,
			};

			this.sessions.set(connId, baseSession);

			// Track user sessions
			if (!this.userSessions.has(mockUserId)) {
				this.userSessions.set(mockUserId, new Set());
			}
			this.userSessions.get(mockUserId)!.add(connId);

			// Track transport type
			this.transportTypes.set(connId, transportType);

			if (isReconnection) {
				log.info(
					`DEVELOPMENT MODE: Connection reconnected (connId=${connId}, transport=${transportType}, preserved ${existingSubscriptions.size} subscriptions)`
				);
			} else {
				log.info(
					`DEVELOPMENT MODE: Connection authenticated without credentials (connId=${connId}, transport=${transportType})`
				);
			}

			return {
				...baseSession,
				transportType,
			};
		}

		// Parse cookies from HTTP upgrade request
		const cookieHeader = request.headers.cookie || '';
		const cookies = cookie.parse(cookieHeader);

		const accessToken = cookies['access_token'];

		if (!accessToken) {
			throw new Error('No access token in cookies');
		}

		try {
			// Verify access token (JWT, session, etc.)
			const { userId, expiresAt } = await this.authService.verifyAccessToken(accessToken);

			const baseSession: BaseSession = {
				connId,
				userId,
				accessToken,
				tokenExpiresAt: expiresAt,
				createdAt: Date.now(),
				lastActivity: Date.now(),
				subscribedEvents: existingSubscriptions,
				eventFilters: existingFilters,
			};

			this.sessions.set(connId, baseSession);

			// Track user sessions
			if (!this.userSessions.has(userId)) {
				this.userSessions.set(userId, new Set());
			}
			this.userSessions.get(userId)!.add(connId);

			// Track transport type
			this.transportTypes.set(connId, transportType);

			if (isReconnection) {
				log.info(
					`Connection reconnected: connId=${connId}, user=${userId}, transport=${transportType}, preserved ${existingSubscriptions.size} subscriptions, expires=${new Date(expiresAt).toISOString()}`
				);
			} else {
				log.info(
					`Connection authenticated: connId=${connId}, user=${userId}, transport=${transportType}, expires=${new Date(expiresAt).toISOString()}`
				);
			}

			return {
				...baseSession,
				transportType,
			};
		} catch (error) {
			log.error('Connection authentication failed', error);
			throw new Error('Invalid access token');
		}
	}

	/**
	 * Validate session for incoming request
	 * Fast validation: only checks expiry, not full token verification
	 *
	 * @param connId - Connection ID to validate
	 * @returns userId and session
	 * @throws Error if session not found or expired
	 */
	validateSession(connId: string): { userId: string; session: BaseSession } {
		const session = this.sessions.get(connId);

		if (!session) {
			throw new Error('Session not found');
		}

		// Update last activity
		session.lastActivity = Date.now();

		// Check if token expired
		const now = Date.now();
		if (now >= session.tokenExpiresAt) {
			log.warn(`Session expired for connId=${connId}`);
			// Remove expired session
			this.removeSession(connId);
			throw new Error('Access token expired');
		}

		return { userId: session.userId, session };
	}

	/**
	 * Refresh session token (called when user refreshes via HTTP endpoint)
	 * Updates ALL sessions for this user
	 *
	 * @param userId - User ID
	 * @param newAccessToken - New access token
	 */
	async refreshSessionToken(userId: string, newAccessToken: string): Promise<void> {
		try {
			const { expiresAt } = await this.authService.verifyAccessToken(newAccessToken);

			const connIds = this.userSessions.get(userId);
			if (!connIds || connIds.size === 0) {
				log.info(`No active sessions for user=${userId}`);
				return;
			}

			let updatedCount = 0;
			connIds.forEach(connId => {
				const session = this.sessions.get(connId);
				if (session) {
					session.accessToken = newAccessToken;
					session.tokenExpiresAt = expiresAt;
					updatedCount++;
				}
			});

			log.info(`Refreshed token for ${updatedCount} sessions (user=${userId})`);
		} catch (error) {
			log.error('Failed to refresh session token', error);
			throw error;
		}
	}

	/**
	 * Get time until token expiration
	 *
	 * @param connId - Connection ID
	 * @returns Time in milliseconds until expiration (0 if not found)
	 */
	getTimeUntilExpiration(connId: string): number {
		const session = this.sessions.get(connId);
		if (!session) return 0;
		return Math.max(0, session.tokenExpiresAt - Date.now());
	}

	/**
	 * Update subscriptions for a connection
	 *
	 * @param connId - Connection ID
	 * @param action - 'subscribe' or 'unsubscribe'
	 * @param events - Array of event types
	 * @param filters - Optional filters for server-side event filtering
	 */
	updateSubscriptions(
		connId: string,
		action: 'subscribe' | 'unsubscribe',
		events: string[],
		filters?: Record<string, unknown>
	): void {
		const session = this.sessions.get(connId);
		if (!session) return;

		if (action === 'subscribe') {
			events.forEach(event => {
				session.subscribedEvents.add(event);
				// Store filters for this event
				if (filters) {
					session.eventFilters.set(event, filters);
					log.info(`Connection ${connId} subscribed to ${event} with filters:`, filters);
				} else {
					log.info(`Connection ${connId} subscribed to ${event} (no filters)`);
				}
			});
		} else {
			events.forEach(event => {
				session.subscribedEvents.delete(event);
				session.eventFilters.delete(event);
			});
			log.info(`Connection ${connId} unsubscribed from:`, events);
		}
	}

	/**
	 * Set complete subscription state for a connection (state-based API)
	 *
	 * Replaces all current subscriptions with the new state in a single atomic operation.
	 * This is more efficient than individual subscribe/unsubscribe messages and simplifies
	 * multi-component subscription management.
	 *
	 * @param connId - Connection ID
	 * @param subscriptions - Complete desired subscription state
	 *
	 * @example
	 * ```typescript
	 * manager.setSubscriptionState('conn-1', [
	 *   { event: 'b2f:task:created' },
	 *   { event: 'b2f:task:updated', filters: { taskId: '123' } }
	 * ]);
	 * ```
	 */
	setSubscriptionState(
		connId: string,
		subscriptions: Array<{ event: string; filters?: Record<string, unknown> }>
	): void {
		const session = this.sessions.get(connId);
		if (!session) {
			log.warn(`Cannot set subscription state: session ${connId} not found`);
			return;
		}

		// Calculate delta for logging
		const oldEvents = new Set(session.subscribedEvents);
		const newEvents = new Set(subscriptions.map(s => s.event));

		const added = subscriptions.filter(s => !oldEvents.has(s.event));
		const removed = Array.from(oldEvents).filter(e => !newEvents.has(e));

		// Replace subscription state atomically
		session.subscribedEvents.clear();
		session.eventFilters.clear();

		subscriptions.forEach(({ event, filters }) => {
			session.subscribedEvents.add(event);
			if (filters) {
				session.eventFilters.set(event, filters);
			}
		});

		// Log delta (context-efficient: only log if there are changes)
		if (added.length > 0 || removed.length > 0) {
			const parts: string[] = [];
			if (added.length > 0) {
				parts.push(`+${added.length} events`);
			}
			if (removed.length > 0) {
				parts.push(`-${removed.length} events`);
			}
			log.info(
				`Connection ${connId} subscription state updated: ${parts.join(', ')} (total: ${subscriptions.length})`
			);
		}
	}

	/**
	 * Check if connection is subscribed to an event
	 *
	 * @param connId - Connection ID
	 * @param eventType - Event type to check
	 * @returns true if subscribed or no subscriptions yet (backward compat)
	 */
	isSubscribed(connId: string, eventType: string): boolean {
		const session = this.sessions.get(connId);
		if (!session) return false;

		// If no subscriptions yet, allow all (backward compat during connection)
		if (session.subscribedEvents.size === 0) return true;

		return session.subscribedEvents.has(eventType);
	}

	/**
	 * Check if event data matches connection's filters
	 *
	 * Server-side filtering: only send events to connections that match ALL filter criteria
	 *
	 * @param connId - Connection ID
	 * @param eventType - Event type
	 * @param eventData - Event data to check against filters
	 * @returns true if event matches filters (or no filters set)
	 *
	 * @example
	 * // Connection subscribed with filters: { workerId: 'worker-123', status: 'IN_PROGRESS' }
	 * // Event data: { workerId: 'worker-123', status: 'IN_PROGRESS', taskId: 'task-1' }
	 * // Returns: true (all filters match)
	 *
	 * // Event data: { workerId: 'worker-456', status: 'IN_PROGRESS', taskId: 'task-2' }
	 * // Returns: false (workerId doesn't match)
	 */
	matchesFilters(connId: string, eventType: string, eventData: unknown): boolean {
		const session = this.sessions.get(connId);
		if (!session) return false;

		// Get filters for this event
		const filters = session.eventFilters.get(eventType);

		// No filters = match all events of this type
		if (!filters || Object.keys(filters).length === 0) {
			return true;
		}

		// Check if eventData is an object
		if (!eventData || typeof eventData !== 'object') {
			log.warn(`Event data is not an object for ${eventType}, cannot apply filters`);
			return true; // Allow through if data format unexpected
		}

		// Check each filter - ALL must match
		for (const [key, expectedValue] of Object.entries(filters)) {
			const actualValue = (eventData as any)[key];

			// Deep equality check for primitives
			if (actualValue !== expectedValue) {
				return false; // Filter doesn't match
			}
		}

		// All filters matched!
		return true;
	}

	/**
	 * Get all subscriptions for a connection
	 *
	 * @param connId - Connection ID
	 * @returns Set of subscribed event types
	 */
	getSubscriptions(connId: string): Set<string> {
		const session = this.sessions.get(connId);
		return session ? session.subscribedEvents : new Set();
	}

	/**
	 * Remove session on disconnect
	 *
	 * @param connId - Connection ID to remove
	 */
	removeSession(connId: string): void {
		const session = this.sessions.get(connId);
		if (!session) return;

		const transportType = this.transportTypes.get(connId);

		// Remove from user sessions
		const userConnections = this.userSessions.get(session.userId);
		if (userConnections) {
			userConnections.delete(connId);
			if (userConnections.size === 0) {
				this.userSessions.delete(session.userId);
			}
		}

		// Remove session and transport type
		this.sessions.delete(connId);
		this.transportTypes.delete(connId);

		if (transportType) {
			log.info(`Removed: connId=${connId}, transport=${transportType}`);
		} else {
			log.info(`Removed: connId=${connId}`);
		}
	}

	/**
	 * Cleanup expired sessions
	 * Called automatically every minute
	 */
	private cleanupExpiredSessions(): void {
		const now = Date.now();
		let cleanedCount = 0;

		this.sessions.forEach((session, connId) => {
			if (now >= session.tokenExpiresAt) {
				this.removeSession(connId);
				cleanedCount++;
			}
		});

		if (cleanedCount > 0) {
			log.info(`Removed ${cleanedCount} expired sessions`);
		}
	}

	/**
	 * Get session info (for debugging/monitoring)
	 *
	 * @param connId - Connection ID
	 * @returns Session or undefined if not found
	 */
	getSession(connId: string): BaseSession | undefined {
		return this.sessions.get(connId);
	}

	/**
	 * Get all sessions for a user
	 *
	 * @param userId - User ID
	 * @returns Array of sessions
	 */
	getUserSessions(userId: string): BaseSession[] {
		const connIds = this.userSessions.get(userId);
		if (!connIds) return [];

		return Array.from(connIds)
			.map(connId => this.sessions.get(connId))
			.filter((session): session is BaseSession => session !== undefined);
	}

	/**
	 * Get statistics (for monitoring)
	 *
	 * @returns Session statistics
	 */
	getStats(): SessionStats {
		return {
			totalSessions: this.sessions.size,
			totalUsers: this.userSessions.size,
			avgSessionsPerUser: this.userSessions.size > 0 ? this.sessions.size / this.userSessions.size : 0,
		};
	}

	/**
	 * Get transport type for a connection
	 *
	 * @param connId - Connection ID
	 * @returns Transport type or undefined if not found
	 */
	getTransportType(connId: string): TransportType | undefined {
		return this.transportTypes.get(connId);
	}

	/**
	 * Check if connection is using real-time transport (WebSocket or SSE)
	 *
	 * @param connId - Connection ID
	 * @returns True if using WebSocket or SSE
	 */
	isRealtimeTransport(connId: string): boolean {
		const type = this.transportTypes.get(connId);
		return type === 'websocket' || type === 'sse';
	}

	/**
	 * Check if connection is using polling transport (Long Polling or HTTP)
	 *
	 * @param connId - Connection ID
	 * @returns True if using Long Polling or HTTP
	 */
	isPollingTransport(connId: string): boolean {
		const type = this.transportTypes.get(connId);
		return type === 'long-polling' || type === 'http';
	}

	/**
	 * Get all connections using a specific transport type
	 *
	 * @param transportType - Transport type
	 * @returns Array of connection IDs
	 */
	getClientsByTransportType(transportType: TransportType): string[] {
		const connections: string[] = [];
		for (const [connId, type] of this.transportTypes) {
			if (type === transportType) {
				connections.push(connId);
			}
		}
		return connections;
	}

	/**
	 * Get all connections using real-time transports (WebSocket + SSE)
	 *
	 * @returns Array of connection IDs
	 */
	getRealtimeClients(): string[] {
		return [...this.getClientsByTransportType('websocket'), ...this.getClientsByTransportType('sse')];
	}

	/**
	 * Get all connections using polling transports (Long Polling + HTTP)
	 *
	 * @returns Array of connection IDs
	 */
	getPollingClients(): string[] {
		return [...this.getClientsByTransportType('long-polling'), ...this.getClientsByTransportType('http')];
	}

	/**
	 * Get enhanced statistics including transport types
	 *
	 * @returns Transport session statistics
	 */
	getTransportStats(): TransportSessionStats {
		const baseStats = this.getStats();

		// Count sessions by transport type
		const byTransportType = {
			websocket: 0,
			sse: 0,
			'long-polling': 0,
			http: 0,
			mock: 0,
		};

		for (const type of this.transportTypes.values()) {
			if (type in byTransportType) {
				byTransportType[type as keyof typeof byTransportType]++;
			}
		}

		return {
			totalSessions: baseStats.totalSessions,
			totalUsers: baseStats.totalUsers,
			avgSessionsPerUser: baseStats.avgSessionsPerUser,
			byTransportType,
		};
	}

	/**
	 * Log current transport distribution
	 *
	 * Useful for monitoring and debugging transport usage.
	 */
	logTransportDistribution(): void {
		const stats = this.getTransportStats();

		// console.log('[Transport] Session distribution:');
		// console.log(`  - Total sessions: ${stats.totalSessions}`);
		// console.log(`  - Total users: ${stats.totalUsers}`);
		// console.log(`  - WebSocket: ${stats.byTransportType.websocket}`);
		// console.log(`  - SSE: ${stats.byTransportType.sse}`);
		// console.log(`  - Long Polling: ${stats.byTransportType['long-polling']}`);
		// console.log(`  - HTTP: ${stats.byTransportType.http}`);
		// console.log(`  - Mock: ${stats.byTransportType.mock}`);
	}

	/**
	 * Cleanup on shutdown
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
		this.sessions.clear();
		this.userSessions.clear();
		this.transportTypes.clear();
	}

	/**
	 * Shutdown the session manager
	 *
	 * Cleans up all resources.
	 * Call during graceful shutdown.
	 */
	shutdown(): void {
		this.destroy();
		log.info('TransportSessionManager shutdown complete');
	}
}
