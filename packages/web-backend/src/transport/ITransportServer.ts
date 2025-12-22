import type { FastifyInstance } from 'fastify';

import type { EventData, EventType } from '@app/shared';

/**
 * ===========================================================================================
 * TRANSPORT SERVER INTERFACE
 * ===========================================================================================
 *
 * Abstraction for server-side transport layer.
 * Allows different implementations (WebSocket, SSE, HTTP polling, mock).
 *
 * Key responsibilities:
 * - Initialize transport server with Fastify app
 * - Broadcast events to all connected clients
 * - Send events to specific clients
 * - Track client connections/disconnections
 * - Provide subscription filtering
 *
 * Implementations:
 * - WebSocketTransportServer: Real-time bidirectional communication
 * - MockTransportServer: In-memory testing implementation
 *
 * ===========================================================================================
 */

/**
 * Client connection handler callback
 */
export type ClientConnectedHandler = (clientId: string) => void;

/**
 * Client disconnection handler callback
 */
export type ClientDisconnectedHandler = (clientId: string) => void;

/**
 * Transport server interface
 *
 * @example
 * ```typescript
 * const server = new WebSocketTransportServer(sessionManager, router);
 * await server.initialize(fastify);
 *
 * // Broadcast to all connected clients
 * server.broadcast('task:created', task);
 *
 * // Send to specific client
 * server.sendToClient(clientId, 'task:updated', task);
 *
 * // Listen for connections
 * server.onClientConnected((clientId) => {
 *   console.log('Client connected:', clientId);
 * });
 * ```
 */
export interface ITransportServer {
	/**
	 * Initialize transport server
	 * Registers routes and WebSocket handlers with Fastify
	 *
	 * @param app - Fastify instance
	 */
	initialize(app: FastifyInstance): Promise<void>;

	/**
	 * Broadcast event to all connected clients
	 * Server-side subscription filtering is applied automatically
	 *
	 * @param event - Event type (e.g., 'task:created', 'worker:heartbeat')
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * server.broadcast('task:created', {
	 *   id: '123',
	 *   name: 'New task',
	 *   status: 'pending',
	 *   // ... other task fields
	 * });
	 * ```
	 */
	broadcast<E extends EventType>(event: E, data: EventData<E>): void;

	/**
	 * Send event to specific client
	 * Checks subscription before sending
	 *
	 * @param clientId - Client ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * server.sendToClient(clientId, 'task:assigned', {
	 *   taskId: '123',
	 *   workerId: 'worker-1',
	 *   assignedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToClient<E extends EventType>(clientId: string, event: E, data: EventData<E>): void;

	/**
	 * Register handler for client connections
	 *
	 * @param handler - Callback invoked when client connects
	 *
	 * @example
	 * ```typescript
	 * server.onClientConnected((clientId) => {
	 *   console.log(`Client ${clientId} connected`);
	 *   // Initialize client-specific state
	 * });
	 * ```
	 */
	onClientConnected(handler: ClientConnectedHandler): void;

	/**
	 * Register handler for client disconnections
	 *
	 * @param handler - Callback invoked when client disconnects
	 *
	 * @example
	 * ```typescript
	 * server.onClientDisconnected((clientId) => {
	 *   console.log(`Client ${clientId} disconnected`);
	 *   // Clean up client-specific state
	 * });
	 * ```
	 */
	onClientDisconnected(handler: ClientDisconnectedHandler): void;

	/**
	 * Get list of all connected client IDs
	 *
	 * @returns Array of client IDs
	 *
	 * @example
	 * ```typescript
	 * const clients = server.getConnectedClients();
	 * console.log(`${clients.length} clients connected`);
	 * ```
	 */
	getConnectedClients(): string[];
}
