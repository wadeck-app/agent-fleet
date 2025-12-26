/**
 * Transport Session Manager - Multi-Transport Support
 *
 * Extends WebSocketSessionManager to support multiple transport types:
 * - WebSocket (bidirectional, real-time)
 * - Server-Sent Events (unidirectional, real-time)
 * - Long Polling (unidirectional, polling-based)
 *
 * Features:
 * - Transport type detection and tracking
 * - Unified session management across all transports
 * - Automatic routing to appropriate broadcast channel
 * - Logging for observability
 *
 * Anti-fragility:
 * - Each transport type is independent
 * - Failure in one transport doesn't affect others
 * - Graceful degradation if transport fails
 * - No shared mutable state between transports
 */
import type { IncomingMessage } from 'http';

import type { TransportType } from '@app/shared/transport';

import type { AuthService } from '../auth/AuthService';
import { type WebSocketSession, WebSocketSessionManager } from './WebSocketSessionManager';

/**
 * Transport session data
 * Extends WebSocket session with transport type
 */
export interface TransportSession extends WebSocketSession {
	/** Type of transport used by this client */
	transportType: TransportType;
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
 * const manager = new TransportSessionManager(authService, messageQueue);
 *
 * // WebSocket connection
 * const wsSession = await manager.authenticateConnection('client-1', request, 'websocket');
 *
 * // SSE connection
 * const sseSession = await manager.authenticateConnection('client-2', request, 'sse');
 *
 * // Get transport type for a client
 * const type = manager.getTransportType('client-1'); // 'websocket'
 *
 * // Cleanup
 * manager.shutdown();
 * ```
 */
export class TransportSessionManager extends WebSocketSessionManager {
	/**
	 * clientId → transport type
	 * Tracks which transport each client is using
	 */
	private transportTypes = new Map<string, TransportType>();

	constructor(authService: AuthService) {
		super(authService);
	}

	/**
	 * Authenticate connection with transport type
	 *
	 * @param clientId - Unique client ID
	 * @param request - HTTP request with cookies
	 * @param transportType - Type of transport (websocket, sse, long-polling). Defaults to 'websocket' for backward compatibility.
	 * @returns Transport session
	 */
	async authenticateConnection(
		clientId: string,
		request: IncomingMessage,
		transportType: TransportType = 'websocket'
	): Promise<TransportSession> {
		// Authenticate using parent class logic
		const baseSession = await super.authenticateConnection(clientId, request);

		// Track transport type
		this.transportTypes.set(clientId, transportType);

		// Create transport session
		const session: TransportSession = {
			...baseSession,
			transportType,
		};

		console.log(`[Transport] Client ${clientId} connected via ${transportType} (user=${session.userId})`);

		return session;
	}

	/**
	 * Get transport type for a client
	 *
	 * @param clientId - Client ID
	 * @returns Transport type or undefined if not found
	 */
	getTransportType(clientId: string): TransportType | undefined {
		return this.transportTypes.get(clientId);
	}

	/**
	 * Check if client is using real-time transport (WebSocket or SSE)
	 *
	 * @param clientId - Client ID
	 * @returns True if using WebSocket or SSE
	 */
	isRealtimeTransport(clientId: string): boolean {
		const type = this.transportTypes.get(clientId);
		return type === 'websocket' || type === 'sse';
	}

	/**
	 * Check if client is using polling transport (Long Polling or HTTP)
	 *
	 * @param clientId - Client ID
	 * @returns True if using Long Polling or HTTP
	 */
	isPollingTransport(clientId: string): boolean {
		const type = this.transportTypes.get(clientId);
		return type === 'long-polling' || type === 'http';
	}

	/**
	 * Get all clients using a specific transport type
	 *
	 * @param transportType - Transport type
	 * @returns Array of client IDs
	 */
	getClientsByTransportType(transportType: TransportType): string[] {
		const clients: string[] = [];
		for (const [clientId, type] of this.transportTypes) {
			if (type === transportType) {
				clients.push(clientId);
			}
		}
		return clients;
	}

	/**
	 * Get all clients using real-time transports (WebSocket + SSE)
	 *
	 * @returns Array of client IDs
	 */
	getRealtimeClients(): string[] {
		return [...this.getClientsByTransportType('websocket'), ...this.getClientsByTransportType('sse')];
	}

	/**
	 * Get all clients using polling transports (Long Polling + HTTP)
	 *
	 * @returns Array of client IDs
	 */
	getPollingClients(): string[] {
		return [...this.getClientsByTransportType('long-polling'), ...this.getClientsByTransportType('http')];
	}

	/**
	 * Remove session
	 * Overrides parent to also clean up transport type tracking
	 *
	 * @param clientId - Client ID
	 */
	removeSession(clientId: string): void {
		const transportType = this.transportTypes.get(clientId);
		this.transportTypes.delete(clientId);

		super.removeSession(clientId);

		if (transportType) {
			console.log(`[Transport] Client ${clientId} disconnected from ${transportType}`);
		}
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
	 * Shutdown the session manager
	 *
	 * Cleans up all resources.
	 * Call during graceful shutdown.
	 */
	shutdown(): void {
		this.transportTypes.clear();
		super.shutdown();
		console.log('[Transport] TransportSessionManager shutdown complete');
	}
}
