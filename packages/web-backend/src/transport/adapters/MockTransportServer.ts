import type { FastifyInstance } from 'fastify';

import type { EventData, EventType } from '@app/shared';

import type { ITransportServer } from '../ITransportServer';

/**
 * ===========================================================================================
 * MOCK TRANSPORT SERVER - IN-MEMORY TESTING IMPLEMENTATION
 * ===========================================================================================
 *
 * Mock implementation of ITransportServer for unit testing.
 *
 * Features:
 * - In-memory client tracking
 * - Records all broadcasts for verification
 * - Records all client-specific sends for verification
 * - Simulates connection/disconnection events
 * - No actual WebSocket connections
 *
 * Usage in tests:
 * ```typescript
 * const mockServer = new MockTransportServer();
 * const broadcaster = new EventBroadcaster(mockServer, sessionManager);
 *
 * broadcaster.broadcast('b2f:task:created', task);
 *
 * expect(mockServer.broadcasts).toHaveLength(1);
 * expect(mockServer.broadcasts[0].event).toBe('b2f:task:created');
 * expect(mockServer.broadcasts[0].data).toEqual(task);
 * ```
 *
 * ===========================================================================================
 */

/**
 * Broadcast record for testing
 */
export interface BroadcastRecord {
	event: string;
	data: any;
	timestamp: number;
}

/**
 * Client send record for testing
 */
export interface ClientSendRecord {
	clientId: string;
	event: string;
	data: any;
	timestamp: number;
}

/**
 * Mock Transport Server
 */
export class MockTransportServer implements ITransportServer {
	private clients = new Set<string>();
	private clientConnectedHandlers: Array<(clientId: string) => void> = [];
	private clientDisconnectedHandlers: Array<(clientId: string) => void> = [];

	// Test records
	public broadcasts: BroadcastRecord[] = [];
	public clientSends: ClientSendRecord[] = [];

	// Optional session manager and auth service for testing authenticated connections
	private sessionManager?: any;
	private authService?: any;

	/**
	 * Initialize (no-op for mock)
	 */
	async initialize(_app: FastifyInstance): Promise<void> {
		// No-op for mock
	}

	/**
	 * Set session manager and auth service for testing authenticated connections
	 */
	setTestDependencies(sessionManager: any, authService: any): void {
		this.sessionManager = sessionManager;
		this.authService = authService;
	}

	/**
	 * Broadcast event to all clients
	 * Records broadcast for test verification
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void {
		this.broadcasts.push({
			event,
			data,
			timestamp: Date.now(),
		});
	}

	/**
	 * Send event to specific client
	 * Records send for test verification
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void {
		if (!this.clients.has(clientId)) {
			console.warn(`[MockTransportServer] Client ${clientId} not connected`);
			return;
		}

		this.clientSends.push({
			clientId,
			event,
			data,
			timestamp: Date.now(),
		});
	}

	/**
	 * Register handler for client connections
	 */
	onClientConnected(handler: (clientId: string) => void): void {
		this.clientConnectedHandlers.push(handler);
	}

	/**
	 * Register handler for client disconnections
	 */
	onClientDisconnected(handler: (clientId: string) => void): void {
		this.clientDisconnectedHandlers.push(handler);
	}

	/**
	 * Get connected clients
	 */
	getConnectedClients(): string[] {
		return Array.from(this.clients);
	}

	/**
	 * Simulate client connection (for testing)
	 */
	simulateConnect(clientId: string): void {
		this.clients.add(clientId);
		this.clientConnectedHandlers.forEach(handler => handler(clientId));
	}

	/**
	 * Simulate authenticated connection (for testing with sessions)
	 * Creates a real authenticated session if sessionManager and authService are set
	 */
	async simulateConnection(clientId: string, userId: string): Promise<void> {
		// Simulate basic connection
		this.simulateConnect(clientId);

		// If we have sessionManager and authService, create a real authenticated session
		if (this.sessionManager && this.authService) {
			// Create an access token for the user
			const { accessToken } = await this.authService.createAccessToken(userId);

			// Create a mock request with the access token in cookies
			const mockRequest = {
				headers: {
					cookie: `access_token=${accessToken}`,
				},
			} as any;

			// Authenticate the connection
			await this.sessionManager.authenticateConnection(clientId, mockRequest);
		}
	}

	/**
	 * Simulate client disconnection (for testing)
	 */
	simulateDisconnect(clientId: string): void {
		this.clients.delete(clientId);
		this.clientDisconnectedHandlers.forEach(handler => handler(clientId));
	}

	/**
	 * Clear all test records
	 */
	clearRecords(): void {
		this.broadcasts = [];
		this.clientSends = [];
	}

	/**
	 * Get broadcasts for specific event type
	 */
	getBroadcastsForEvent(event: string): BroadcastRecord[] {
		return this.broadcasts.filter(b => b.event === event);
	}

	/**
	 * Get sends for specific client
	 */
	getSendsForClient(clientId: string): ClientSendRecord[] {
		return this.clientSends.filter(s => s.clientId === clientId);
	}

	/**
	 * Get sends for specific event type
	 */
	getSendsForEvent(event: string): ClientSendRecord[] {
		return this.clientSends.filter(s => s.event === event);
	}
}
