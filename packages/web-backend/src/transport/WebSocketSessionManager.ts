import cookie from 'cookie';
import type { IncomingMessage } from 'http';

import type { AuthService } from '../auth/AuthService';

/**
 * ===========================================================================================
 * WEBSOCKET SESSION MANAGER - CORE SECURITY FOR TRANSPORT LAYER
 * ===========================================================================================
 *
 * Manages WebSocket sessions with authentication and subscription tracking.
 * This is the critical security component that bridges HTTP authentication and WebSocket connections.
 *
 * Features:
 * - Parse HTTP_ONLY cookies from WebSocket upgrade request
 * - Authenticate connections using AuthService
 * - Track session info (userId, token, expiration)
 * - Multi-device support (multiple clientIds per userId)
 * - Fast session validation (only expiry check, no full token verification)
 * - Automatic session cleanup (expired sessions removed every minute)
 * - Subscription tracking (which events each client subscribed to)
 *
 * Security flow:
 * 1. WebSocket upgrade → Parse cookies from HTTP headers
 * 2. Validate access_token using AuthService
 * 3. Create session in memory (clientId → userId + token + expiry)
 * 4. Each WebSocket message → Fast validation (check expiry only)
 * 5. HTTP token refresh → Update ALL WebSocket sessions for that user
 *
 * ===========================================================================================
 */

/**
 * WebSocket session data
 */
export interface WebSocketSession {
	clientId: string;
	userId: string;
	accessToken: string;
	tokenExpiresAt: number;
	createdAt: number;
	lastActivity: number;
	// Track which events this client is subscribed to
	subscribedEvents: Set<string>;
}

/**
 * Session statistics
 */
export interface SessionStats {
	totalSessions: number;
	totalUsers: number;
	avgSessionsPerUser: number;
}

export class WebSocketSessionManager {
	// clientId → session info
	private sessions = new Map<string, WebSocketSession>();

	// userId → Set of clientIds (multi-device support)
	private userSessions = new Map<string, Set<string>>();

	// Cleanup timer
	private cleanupTimer?: NodeJS.Timeout;

	constructor(private authService: AuthService) {
		// Cleanup expired sessions every minute
		this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 60000);
	}

	/**
	 * Authenticate WebSocket from HTTP cookies
	 * Called during WebSocket upgrade (GET /ws)
	 *
	 * @param clientId - Unique client ID for this connection
	 * @param request - HTTP upgrade request containing cookies
	 * @returns WebSocket session
	 * @throws Error if authentication fails
	 */
	async authenticateConnection(clientId: string, request: IncomingMessage): Promise<WebSocketSession> {
		// DEVELOPMENT ONLY: Bypass authentication if DISABLE_AUTH_DEV=true
		// This allows frontend development without authentication blocking
		// NEVER use this in production!
		const disableAuthDev = process.env.DISABLE_AUTH_DEV === 'true';

		// SECURITY: Double-check we're not in production
		// This prevents bypass if someone removes the startup check
		if (disableAuthDev) {
			if (process.env.NODE_ENV === 'production') {
				console.error('[Auth] FATAL: DISABLE_AUTH_DEV=true detected in production!');
				throw new Error('WebSocket authentication bypass not allowed in production');
			}

			const mockUserId = 'dev-user-no-auth';
			const mockToken = 'dev-bypass-token';
			// Set expiration far in the future (1 year)
			const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

			const session: WebSocketSession = {
				clientId,
				userId: mockUserId,
				accessToken: mockToken,
				tokenExpiresAt: expiresAt,
				createdAt: Date.now(),
				lastActivity: Date.now(),
				subscribedEvents: new Set(),
			};

			this.sessions.set(clientId, session);

			// Track user sessions
			if (!this.userSessions.has(mockUserId)) {
				this.userSessions.set(mockUserId, new Set());
			}
			this.userSessions.get(mockUserId)!.add(clientId);

			console.log(`[Auth] DEVELOPMENT MODE: WebSocket authenticated without credentials (client=${clientId})`);

			return session;
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

			const session: WebSocketSession = {
				clientId,
				userId,
				accessToken,
				tokenExpiresAt: expiresAt,
				createdAt: Date.now(),
				lastActivity: Date.now(),
				subscribedEvents: new Set(), // Empty initially
			};

			this.sessions.set(clientId, session);

			// Track user sessions
			if (!this.userSessions.has(userId)) {
				this.userSessions.set(userId, new Set());
			}
			this.userSessions.get(userId)!.add(clientId);

			console.log(
				`[Auth] WebSocket authenticated: client=${clientId}, user=${userId}, expires=${new Date(expiresAt).toISOString()}`
			);

			return session;
		} catch (error) {
			console.error('[Auth] WebSocket authentication failed', error);
			throw new Error('Invalid access token');
		}
	}

	/**
	 * Validate session for incoming request
	 * Fast validation: only checks expiry, not full token verification
	 *
	 * @param clientId - Client ID to validate
	 * @returns userId and session
	 * @throws Error if session not found or expired
	 */
	validateSession(clientId: string): { userId: string; session: WebSocketSession } {
		const session = this.sessions.get(clientId);

		if (!session) {
			throw new Error('Session not found');
		}

		// Update last activity
		session.lastActivity = Date.now();

		// Check if token expired
		const now = Date.now();
		if (now >= session.tokenExpiresAt) {
			console.warn(`[Auth] Session expired for client=${clientId}`);
			// Remove expired session
			this.removeSession(clientId);
			throw new Error('Access token expired');
		}

		return { userId: session.userId, session };
	}

	/**
	 * Refresh session token (called when user refreshes via HTTP endpoint)
	 * Updates ALL WebSocket sessions for this user
	 *
	 * @param userId - User ID
	 * @param newAccessToken - New access token
	 */
	async refreshSessionToken(userId: string, newAccessToken: string): Promise<void> {
		try {
			const { expiresAt } = await this.authService.verifyAccessToken(newAccessToken);

			const clientIds = this.userSessions.get(userId);
			if (!clientIds || clientIds.size === 0) {
				console.log(`[Auth] No active WebSocket sessions for user=${userId}`);
				return;
			}

			let updatedCount = 0;
			clientIds.forEach(clientId => {
				const session = this.sessions.get(clientId);
				if (session) {
					session.accessToken = newAccessToken;
					session.tokenExpiresAt = expiresAt;
					updatedCount++;
				}
			});

			console.log(`[Auth] Refreshed token for ${updatedCount} WebSocket sessions (user=${userId})`);
		} catch (error) {
			console.error('[Auth] Failed to refresh WebSocket session token', error);
			throw error;
		}
	}

	/**
	 * Get time until token expiration
	 *
	 * @param clientId - Client ID
	 * @returns Time in milliseconds until expiration (0 if not found)
	 */
	getTimeUntilExpiration(clientId: string): number {
		const session = this.sessions.get(clientId);
		if (!session) return 0;
		return Math.max(0, session.tokenExpiresAt - Date.now());
	}

	/**
	 * Update subscriptions for a client
	 *
	 * @param clientId - Client ID
	 * @param action - 'subscribe' or 'unsubscribe'
	 * @param events - Array of event types
	 */
	updateSubscriptions(clientId: string, action: 'subscribe' | 'unsubscribe', events: string[]): void {
		const session = this.sessions.get(clientId);
		if (!session) return;

		if (action === 'subscribe') {
			events.forEach(event => session.subscribedEvents.add(event));
			console.log(`[Subscription] Client ${clientId} subscribed to:`, events);
		} else {
			events.forEach(event => session.subscribedEvents.delete(event));
			console.log(`[Subscription] Client ${clientId} unsubscribed from:`, events);
		}
	}

	/**
	 * Check if client is subscribed to an event
	 *
	 * @param clientId - Client ID
	 * @param eventType - Event type to check
	 * @returns true if subscribed or no subscriptions yet (backward compat)
	 */
	isSubscribed(clientId: string, eventType: string): boolean {
		const session = this.sessions.get(clientId);
		if (!session) return false;

		// If no subscriptions yet, allow all (backward compat during connection)
		if (session.subscribedEvents.size === 0) return true;

		return session.subscribedEvents.has(eventType);
	}

	/**
	 * Get all subscriptions for a client
	 *
	 * @param clientId - Client ID
	 * @returns Set of subscribed event types
	 */
	getSubscriptions(clientId: string): Set<string> {
		const session = this.sessions.get(clientId);
		return session ? session.subscribedEvents : new Set();
	}

	/**
	 * Remove session on disconnect
	 *
	 * @param clientId - Client ID to remove
	 */
	removeSession(clientId: string): void {
		const session = this.sessions.get(clientId);
		if (!session) return;

		// Remove from user sessions
		const userClients = this.userSessions.get(session.userId);
		if (userClients) {
			userClients.delete(clientId);
			if (userClients.size === 0) {
				this.userSessions.delete(session.userId);
			}
		}

		this.sessions.delete(clientId);
		console.log(`[Session] Removed: client=${clientId}`);
	}

	/**
	 * Cleanup expired sessions
	 * Called automatically every minute
	 */
	private cleanupExpiredSessions(): void {
		const now = Date.now();
		let cleanedCount = 0;

		this.sessions.forEach((session, clientId) => {
			if (now >= session.tokenExpiresAt) {
				this.removeSession(clientId);
				cleanedCount++;
			}
		});

		if (cleanedCount > 0) {
			console.log(`[Cleanup] Removed ${cleanedCount} expired sessions`);
		}
	}

	/**
	 * Get session info (for debugging/monitoring)
	 *
	 * @param clientId - Client ID
	 * @returns Session or undefined if not found
	 */
	getSession(clientId: string): WebSocketSession | undefined {
		return this.sessions.get(clientId);
	}

	/**
	 * Get all sessions for a user
	 *
	 * @param userId - User ID
	 * @returns Array of sessions
	 */
	getUserSessions(userId: string): WebSocketSession[] {
		const clientIds = this.userSessions.get(userId);
		if (!clientIds) return [];

		return Array.from(clientIds)
			.map(clientId => this.sessions.get(clientId))
			.filter((session): session is WebSocketSession => session !== undefined);
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
	 * Cleanup on shutdown
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
		this.sessions.clear();
		this.userSessions.clear();
	}
}
