/**
 * ===========================================================================================
 * ORCHESTRATOR TRANSPORT INTERFACE
 * ===========================================================================================
 *
 * Abstract transport layer for Backend ↔ Orchestrator communication.
 * Supports multiple transport protocols (WebSocket, REST+SSE, REST+LongPolling).
 *
 * Responsibilities:
 * - Send B→O requests and receive responses
 * - Subscribe to O→B events
 * - Handle connection lifecycle
 *
 * Implementations:
 * - WebSocketTransport: Bidirectional WebSocket (lowest latency)
 * - RestSseTransport: REST requests + Server-Sent Events for events
 * - RestLongPollingTransport: REST requests + long-polling for events
 *
 * @example
 * ```typescript
 * const transport = await TransportFactory.create({ url: 'http://orch:3737', mode: 'auto' });
 *
 * await transport.connect();
 *
 * // Send B→O request
 * const response = await transport.request({
 *   id: 'req-123',
 *   method: 'createTask',
 *   params: { description: 'New task' },
 * });
 *
 * // Subscribe to O→B events
 * transport.subscribe('task.created');
 * transport.onEvent((event: O2BEvent) => {
 *   console.log('Received event:', event);
 * });
 * ```
 *
 * ===========================================================================================
 */
import type { B2ORequest, B2OResponse } from '@app/shared-orch-backend';
import type { O2BEvent, O2BEventType } from '@app/shared-orch-backend';

/**
 * Transport event handler
 */
export type TransportEventHandler = (event: O2BEvent) => void;

/**
 * Orchestrator Transport Interface
 *
 * Abstract interface for all transport implementations.
 * Each transport must implement this interface to work with RemoteAdapter.
 */
export interface OrchestratorTransport {
	// ===========================================================================================
	// B→O REQUEST/RESPONSE
	// ===========================================================================================

	/**
	 * Send a B→O request and wait for response
	 *
	 * @param request - B→O request (method + params)
	 * @returns Promise resolving to B→O response
	 * @throws Error if request fails or times out
	 *
	 * @example
	 * ```typescript
	 * const response = await transport.request({
	 *   id: 'req-123',
	 *   method: 'createTask',
	 *   params: { description: 'New task', metadata: {} },
	 * });
	 *
	 * if (response.error) {
	 *   throw new Error(response.error.message);
	 * }
	 *
	 * const task = response.result as Task;
	 * ```
	 */
	request(request: B2ORequest): Promise<B2OResponse>;

	// ===========================================================================================
	// O→B EVENT SUBSCRIPTION
	// ===========================================================================================

	/**
	 * Subscribe to an O→B event type
	 * Future events of this type will be delivered via onEvent handler
	 *
	 * @param eventType - Event type to subscribe to (e.g., 'task.created', 'worker.status')
	 *
	 * @example
	 * ```typescript
	 * transport.subscribe('task.created');
	 * transport.subscribe('task.completed');
	 * transport.subscribe('worker.status');
	 * ```
	 */
	subscribe(eventType: O2BEventType): void;

	/**
	 * Unsubscribe from an O→B event type
	 * Stops receiving events of this type
	 *
	 * @param eventType - Event type to unsubscribe from
	 *
	 * @example
	 * ```typescript
	 * transport.unsubscribe('task.created');
	 * ```
	 */
	unsubscribe(eventType: O2BEventType): void;

	/**
	 * Register event handler for all subscribed O→B events
	 * Only one handler can be registered (replaces previous handler)
	 *
	 * @param handler - Event handler function
	 *
	 * @example
	 * ```typescript
	 * transport.onEvent((event: O2BEvent) => {
	 *   switch (event.type) {
	 *     case 'task.created':
	 *       console.log('Task created:', event.data.taskId);
	 *       break;
	 *     case 'worker.status':
	 *       console.log('Worker status:', event.data.workerId, event.data.status);
	 *       break;
	 *   }
	 * });
	 * ```
	 */
	onEvent(handler: TransportEventHandler): void;

	/**
	 * Remove event handler
	 * Stops receiving event notifications
	 */
	offEvent(): void;

	// ===========================================================================================
	// CONNECTION LIFECYCLE
	// ===========================================================================================

	/**
	 * Connect to orchestrator server
	 * Must be called before sending requests or subscribing to events
	 *
	 * @returns Promise resolving when connection is established
	 * @throws Error if connection fails
	 *
	 * @example
	 * ```typescript
	 * await transport.connect();
	 * console.log('Connected to orchestrator');
	 * ```
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from orchestrator server
	 * Cleans up resources and closes connection
	 *
	 * @returns Promise resolving when disconnection is complete
	 *
	 * @example
	 * ```typescript
	 * await transport.disconnect();
	 * console.log('Disconnected from orchestrator');
	 * ```
	 */
	disconnect(): Promise<void>;

	/**
	 * Check if transport is currently connected
	 *
	 * @returns true if connected, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (!transport.isConnected()) {
	 *   await transport.connect();
	 * }
	 * ```
	 */
	isConnected(): boolean;
}
