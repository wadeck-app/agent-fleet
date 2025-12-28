import type { FastifyInstance } from 'fastify';

import type { EventData, EventType } from '@app/shared/transport';

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
export type ClientConnectedHandler = (connId: string) => void;

/**
 * Client disconnection handler callback
 */
export type ClientDisconnectedHandler = (connId: string) => void;

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
	 * Send event to specific connection
	 * Checks subscription before sending
	 *
	 * @param connId - Connection ID to send to
	 * @param event - Event type
	 * @param data - Event data matching the event type
	 *
	 * @example
	 * ```typescript
	 * server.sendToClient(connId, 'task:assigned', {
	 *   taskId: '123',
	 *   workerId: 'worker-1',
	 *   assignedAt: Date.now(),
	 * });
	 * ```
	 */
	sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>): void;

	/**
	 * Register handler for client connections
	 *
	 * @param handler - Callback invoked when client connects
	 *
	 * @example
	 * ```typescript
	 * server.onClientConnected((connId) => {
	 *   console.log(`Connection ${connId} connected`);
	 *   // Initialize connection-specific state
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
	 * server.onClientDisconnected((connId) => {
	 *   console.log(`Connection ${connId} disconnected`);
	 *   // Clean up connection-specific state
	 * });
	 * ```
	 */
	onClientDisconnected(handler: ClientDisconnectedHandler): void;

	/**
	 * Get list of all connected connection IDs
	 *
	 * @returns Array of connection IDs
	 *
	 * @example
	 * ```typescript
	 * const connections = server.getConnectedClients();
	 * console.log(`${connections.length} connections active`);
	 * ```
	 */
	getConnectedClients(): string[];
}
