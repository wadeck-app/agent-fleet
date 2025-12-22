/**
 * Transport Client Interface
 *
 * Extended transport interface for frontend clients with connection management
 * and client-specific features.
 *
 * This interface extends the base ITransport interface from shared-frontend-backend
 * with additional client-side capabilities:
 * - Connection lifecycle management (connect/disconnect)
 * - Connection state tracking
 * - Transport type identification
 *
 * Implementations:
 * - WebSocketTransportClient: Real-time bidirectional communication
 * - RestTransportClient: HTTP/REST fallback for environments without WebSocket
 * - MockTransportClient: In-memory mock for testing and Storybook
 *
 * @see packages/shared-frontend-backend/src/transport/TypedTransport.ts
 */
import type { ConnectionStateHandler, ITransport, TransportType } from 'shared-frontend-backend/transport';

/**
 * Transport Client Interface
 *
 * Extended transport interface with client-specific methods for connection
 * management and state tracking.
 *
 * @example
 * ```typescript
 * // Create and connect
 * const client: ITransportClient = new WebSocketTransportClient(config);
 * await client.connect();
 *
 * // Check state
 * if (client.isConnected()) {
 *   const tasks = await client.request('GET', '/api/tasks/');
 * }
 *
 * // Listen for connection changes
 * const unsubscribe = client.onConnectionStateChange((state) => {
 *   console.log('Connection state:', state);
 * });
 *
 * // Disconnect
 * await client.disconnect();
 * unsubscribe();
 * ```
 */
export interface ITransportClient extends ITransport {
	/**
	 * Connect to the transport server
	 *
	 * Establishes the connection (WebSocket, SSE, etc.) and authenticates
	 * using HTTP_ONLY cookies.
	 *
	 * @returns Promise that resolves when connected and authenticated
	 * @throws Error if connection fails or authentication fails
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await client.connect();
	 *   console.log('Connected');
	 * } catch (error) {
	 *   console.error('Connection failed:', error);
	 * }
	 * ```
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from the transport server
	 *
	 * Closes the connection gracefully and cleans up resources.
	 * Stops automatic token refresh if active.
	 *
	 * @returns Promise that resolves when disconnected
	 *
	 * @example
	 * ```typescript
	 * await client.disconnect();
	 * console.log('Disconnected');
	 * ```
	 */
	disconnect(): Promise<void>;

	/**
	 * Check if currently connected
	 *
	 * @returns True if connection is established and ready
	 *
	 * @example
	 * ```typescript
	 * if (client.isConnected()) {
	 *   // Safe to make requests
	 *   await client.request('GET', '/api/tasks/');
	 * }
	 * ```
	 */
	isConnected(): boolean;

	/**
	 * Get the transport type
	 *
	 * @returns Transport type identifier
	 *
	 * @example
	 * ```typescript
	 * const type = client.getTransportType();
	 * if (type === 'websocket') {
	 *   console.log('Using real-time WebSocket transport');
	 * }
	 * ```
	 */
	getTransportType(): TransportType;

	/**
	 * Subscribe to connection state changes
	 *
	 * Inherited from ITransport. Called when connection state transitions:
	 * - disconnected → connecting → connected
	 * - connected → reconnecting → connected (on reconnection)
	 * - connected → disconnected (on disconnect)
	 * - * → error (on fatal error)
	 *
	 * @param handler - Connection state change handler
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = client.onConnectionStateChange((state) => {
	 *   switch (state) {
	 *     case 'connected':
	 *       console.log('Connected');
	 *       break;
	 *     case 'reconnecting':
	 *       console.log('Reconnecting...');
	 *       break;
	 *     case 'error':
	 *       console.error('Connection error');
	 *       break;
	 *   }
	 * });
	 * ```
	 */
	onConnectionStateChange(handler: ConnectionStateHandler): () => void;
}

/**
 * Re-export types from shared package for convenience
 */
export type {
	TransportConfig,
	ConnectionState,
	ConnectionStateHandler,
	TransportType,
} from 'shared-frontend-backend/transport';
