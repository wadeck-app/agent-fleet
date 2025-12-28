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
import type { ConnectionStateHandler, ITransport, TransportType } from '@shared/transport';

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
	 * Check if currently connecting, to avoid starting another connection yet but returning the current one
	 *
	 * @returns True if connection is in progress
	 */
	isConnecting(): boolean;

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

	/**
	 * Subscribe to multiple events in a single request (unified subscription API)
	 *
	 * Batch subscription endpoint for efficient subscription management.
	 * Supported by SSE, Long Polling, and HTTP Polling transports.
	 *
	 * @param events - Array of event types to subscribe to
	 * @param filters - Optional filters per event type for server-side filtering
	 * @returns Promise that resolves when subscription is confirmed
	 *
	 * @example
	 * ```typescript
	 * await client.subscribeBatch(
	 *   ['b2f:task:created', 'b2f:task:updated'],
	 *   {
	 *     'b2f:task:created': { workerId: 'worker-123' },
	 *     'b2f:task:updated': { status: 'IN_PROGRESS' }
	 *   }
	 * );
	 * ```
	 */
	subscribeBatch?(events: string[], filters?: Record<string, Record<string, unknown>>): Promise<void>;

	/**
	 * Subscribe to a single event (unified subscription API)
	 *
	 * Individual event subscription endpoint.
	 * Supported by SSE, Long Polling, and HTTP Polling transports.
	 *
	 * @param event - Event type to subscribe to
	 * @param filters - Optional filters for server-side filtering
	 * @returns Promise that resolves when subscription is confirmed
	 *
	 * @example
	 * ```typescript
	 * await client.subscribeToEvent('b2f:task:created', {
	 *   workerId: 'worker-123'
	 * });
	 * ```
	 */
	subscribeToEvent?(event: string, filters?: Record<string, unknown>): Promise<void>;

	/**
	 * Unsubscribe from a single event (unified subscription API)
	 *
	 * @param event - Event type to unsubscribe from
	 * @returns Promise that resolves when unsubscription is confirmed
	 *
	 * @example
	 * ```typescript
	 * await client.unsubscribeFromEvent('b2f:task:created');
	 * ```
	 */
	unsubscribeFromEvent?(event: string): Promise<void>;

	/**
	 * Get current subscriptions (unified subscription API)
	 *
	 * @returns Promise resolving to array of current subscriptions with filters
	 *
	 * @example
	 * ```typescript
	 * const subscriptions = await client.getSubscriptions();
	 * console.log('Subscribed events:', subscriptions.map(s => s.event));
	 * ```
	 */
	getSubscriptions?(): Promise<Subscription[]>;

	/**
	 * Get transport status and connection details (unified subscription API)
	 *
	 * @returns Promise resolving to current transport status
	 *
	 * @example
	 * ```typescript
	 * const status = await client.getTransportStatus();
	 * console.log('Connected as:', status.userId);
	 * console.log('Subscribed to:', status.subscriptions.length, 'events');
	 * ```
	 */
	getTransportStatus?(): Promise<TransportStatus>;

	/**
	 * Get local subscriptions (synchronous)
	 *
	 * Returns event types that have handlers registered locally.
	 * This is a synchronous method that reads from the local eventHandlers map.
	 * Does not make any network calls.
	 *
	 * @returns Array of event types with active handlers
	 *
	 * @example
	 * ```typescript
	 * const subscriptions = client.getLocalSubscriptions();
	 * console.log('Subscribed to:', subscriptions);
	 * // Output: ['b2f:worker:updated', 'b2f:task:created']
	 * ```
	 */
	getLocalSubscriptions(): string[];
}

/**
 * Subscription
 * Represents an active event subscription with optional filters
 */
export interface Subscription {
	/** Event type being subscribed to */
	event: string;
	/** Optional server-side filters */
	filters?: Record<string, unknown>;
}

/**
 * Transport Status
 * Complete status information about the transport connection
 */
export interface TransportStatus {
	/** Unique client identifier */
	clientId: string;
	/** Authenticated user ID */
	userId: string;
	/** Transport type being used */
	transportType: TransportType;
	/** Whether client is currently connected */
	connected: boolean;
	/** Timestamp when authentication completed */
	authenticatedAt: number;
	/** Timestamp of last activity */
	lastActivity: number;
	/** List of subscribed event types */
	subscriptions: string[];
	/** Number of queued events waiting for delivery */
	queuedEvents: number;
}
