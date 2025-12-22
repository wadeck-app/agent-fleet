import type { HttpMethod, PathsForMethod, RouteBody, RouteParams, RouteQuery, RouteResponse } from '../types';
import { ALL_API_ROUTES } from '../types';
import type { EventData, EventType } from './EventTypes';

/**
 * Request Options
 * Options for making a typed request
 *
 * @template M - HTTP method
 * @template P - Path string
 */
export type RequestOptions<M extends HttpMethod, P extends PathsForMethod<M>> = {
	/** Path parameters (e.g., { id: '123' } for /api/tasks/:id) */
	params?: RouteParams<M, P>;
	/** Query parameters */
	query?: RouteQuery<M, P>;
	/** Request body */
	body?: RouteBody<M, P>;
	/** Request headers */
	headers?: Record<string, string>;
};

/**
 * Response Type
 * Extract the response type for a specific method and path
 *
 * @template M - HTTP method
 * @template P - Path string
 */
export type ResponseType<M extends HttpMethod, P extends PathsForMethod<M>> = RouteResponse<M, P>;

/**
 * Unsubscribe Function
 * Function returned by subscribe methods to unsubscribe from events
 */
export type UnsubscribeFunction = () => void;

/**
 * Connection State
 * Current state of the transport connection
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Connection State Handler
 * Callback for connection state changes
 */
export type ConnectionStateHandler = (state: ConnectionState) => void;

/**
 * Event Handler
 * Callback for handling events of a specific type
 *
 * @template E - Event type
 */
export type EventHandler<E extends EventType> = (data: EventData<E>) => void;

/**
 * Transport Type
 * Type of transport mechanism being used
 */
export type TransportType = 'websocket' | 'sse' | 'long-polling' | 'http' | 'mock';

/**
 * ITransport Interface
 * Type-safe transport layer abstraction
 *
 * This interface provides:
 * 1. Type-safe request/response based on ALL_API_ROUTES
 * 2. Type-safe event subscriptions based on EventTypes
 * 3. Connection state management
 * 4. Transport-agnostic API (works with WebSocket, SSE, HTTP, etc.)
 *
 * @example
 * ```typescript
 * // Type-safe request
 * const tasks = await transport.request('GET', '/api/tasks/', {
 *   query: { status: 'todo' }
 * });
 * // tasks is typed as TasksData
 *
 * // Type-safe event subscription
 * const unsubscribe = transport.subscribe('task:created', (task) => {
 *   console.log('New task:', task);
 *   // task is typed as Task
 * });
 * ```
 */
export interface ITransport {
	/**
	 * Make a type-safe request
	 *
	 * @template M - HTTP method
	 * @template P - Path (must be a valid path for the given method)
	 * @param method - HTTP method
	 * @param path - API path
	 * @param options - Request options (params, query, body, headers)
	 * @returns Promise resolving to the typed response
	 *
	 * @example
	 * ```typescript
	 * // GET request with query
	 * const tasks = await transport.request('GET', '/api/tasks/', {
	 *   query: { status: 'todo' }
	 * });
	 *
	 * // POST request with body
	 * const newTask = await transport.request('POST', '/api/tasks/', {
	 *   body: { description: 'New task', priority: 'high' }
	 * });
	 * ```
	 */
	request<M extends HttpMethod, P extends PathsForMethod<M>>(
		method: M,
		path: P,
		options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>>;

	/**
	 * Subscribe to a specific event type
	 *
	 * @template E - Event type (must be a valid EventType)
	 * @param event - Event type to subscribe to
	 * @param handler - Event handler callback
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * // Subscribe to task creation events
	 * const unsubscribe = transport.subscribe('task:created', (task) => {
	 *   console.log('Task created:', task.id);
	 * });
	 *
	 * // Later, unsubscribe
	 * unsubscribe();
	 * ```
	 */
	subscribe<E extends EventType>(event: E, handler: EventHandler<E>): UnsubscribeFunction;

	/**
	 * Subscribe to connection state changes
	 *
	 * @param handler - Connection state change handler
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = transport.onConnectionStateChange((state) => {
	 *   console.log('Connection state:', state);
	 *   if (state === 'disconnected') {
	 *     // Handle disconnection
	 *   }
	 * });
	 * ```
	 */
	onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction;

	/**
	 * Connect to the transport
	 * @returns Promise that resolves when connected
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from the transport
	 * @returns Promise that resolves when disconnected
	 */
	disconnect(): Promise<void>;

	/**
	 * Check if currently connected
	 * @returns True if connected
	 */
	isConnected(): boolean;

	/**
	 * Get current transport type
	 * @returns Transport type
	 */
	getTransportType(): TransportType;
}

/**
 * Transport Configuration
 * Configuration options for transport implementations
 */
export interface TransportConfig {
	/** Base URL for HTTP requests (e.g., 'http://localhost:3000') */
	baseUrl: string;

	/** WebSocket URL (optional, defaults to baseUrl with ws:// protocol) */
	wsUrl?: string;

	/** Connection timeout in milliseconds */
	connectionTimeout?: number;

	/** Request timeout in milliseconds */
	requestTimeout?: number;

	/** Enable automatic reconnection */
	reconnect?: boolean;

	/** Maximum reconnection attempts */
	reconnectMaxAttempts?: number;

	/** Initial reconnection delay in milliseconds */
	reconnectDelay?: number;

	/** Custom headers to include in all requests */
	headers?: Record<string, string>;
}

/**
 * Type guard to check if a path is valid for a given method
 *
 * @template M - HTTP method
 * @param method - HTTP method
 * @param path - Path to check
 * @returns True if path is valid for the method
 */
export function isValidPath<M extends HttpMethod>(method: M, path: string): path is PathsForMethod<M> {
	const routes = ALL_API_ROUTES as any;
	return path in routes && method in routes[path];
}

/**
 * Get available methods for a path
 *
 * @param path - Path to check
 * @returns Array of available HTTP methods
 */
export function getAvailableMethods(path: string): HttpMethod[] {
	const routes = ALL_API_ROUTES as any;
	if (!(path in routes)) {
		return [];
	}
	return Object.keys(routes[path]) as HttpMethod[];
}
