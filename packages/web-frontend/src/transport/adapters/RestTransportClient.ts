/**
 * REST Transport Client
 *
 * HTTP/REST-based transport for environments without WebSocket support or as a fallback.
 * Uses fetch with credentials: 'include' for HTTP_ONLY cookie authentication.
 *
 * Key Features:
 * - Type-safe HTTP requests
 * - HTTP_ONLY cookie authentication
 * - No real-time events (could use polling, but keeping simple)
 * - Error handling with TransportError format
 * - Path parameter substitution
 * - Query parameter serialization
 *
 * Security:
 * - Uses HTTP_ONLY cookies for authentication
 * - Never exposes tokens to JavaScript
 * - Browser automatically sends cookies with credentials: 'include'
 *
 * Limitations:
 * - No real-time event subscriptions (use WebSocketTransportClient for that)
 * - Each request is independent (no persistent connection)
 *
 * @example
 * ```typescript
 * const client = new RestTransportClient({
 *   baseUrl: 'http://localhost:3000'
 * });
 *
 * // Connect (no-op for REST)
 * await client.connect();
 *
 * // Make requests
 * const tasks = await client.request('GET', '/api/tasks/', {
 *   query: { status: 'todo' }
 * });
 *
 * // Create a task
 * const newTask = await client.request('POST', '/api/tasks/', {
 *   body: { description: 'New task', priority: 'high' }
 * });
 *
 * // Update a task
 * const updated = await client.request('PATCH', '/api/tasks/:id', {
 *   params: { id: '123' },
 *   body: { status: 'done' }
 * });
 * ```
 */
import type {
	ConnectionState,
	ConnectionStateHandler,
	EventHandler,
	EventType,
	HttpMethod,
	PathsForMethod,
	RequestOptions,
	ResponseType,
	TransportConfig,
	TransportType,
	UnsubscribeFunction,
} from '@shared/transport';

import type { ITransportClient } from '../ITransportClient';

/**
 * REST Transport Client
 *
 * Implements ITransportClient using HTTP/REST (fetch API) for request/response communication.
 * No real-time event support.
 */
export class RestTransportClient implements ITransportClient {
	/**
	 * Current connection state
	 */
	private connectionState: ConnectionState = 'disconnected';

	/**
	 * Connection state change handlers
	 */
	private connectionStateHandlers = new Set<ConnectionStateHandler>();

	/**
	 * Create a new RestTransportClient
	 * @param config - Transport configuration
	 */
	constructor(private config: TransportConfig) {}

	/**
	 * Connect (no-op for REST)
	 *
	 * REST is connectionless, so this just validates the configuration
	 * and sets the state to 'connected'.
	 */
	async connect(): Promise<void> {
		if (this.connectionState === 'connected') {
			return;
		}

		this.updateConnectionState('connecting');

		// Validate base URL
		if (!this.config.baseUrl) {
			this.updateConnectionState('error');
			throw new Error('Base URL is required');
		}

		this.updateConnectionState('connected');
	}

	/**
	 * Disconnect (no-op for REST)
	 */
	async disconnect(): Promise<void> {
		this.updateConnectionState('disconnected');
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.connectionState === 'connected';
	}

	/**
	 * Get transport type
	 */
	getTransportType(): TransportType {
		return 'http';
	}

	/**
	 * Make a type-safe HTTP request
	 *
	 * SECURITY: Uses credentials: 'include' to send HTTP_ONLY cookies
	 */
	async request<M extends HttpMethod, P extends PathsForMethod<M>>(
		method: M,
		path: P,
		options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>> {
		let url = `${this.config.baseUrl}${path}`;

		// Build URL with params
		if (options?.params) {
			Object.entries(options.params).forEach(([key, value]) => {
				url = url.replace(`:${key}`, encodeURIComponent(value as string));
			});
		}

		// Add query parameters
		if (options?.query) {
			const queryString = new URLSearchParams(options.query as any).toString();
			if (queryString) {
				url += `?${queryString}`;
			}
		}

		try {
			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					...this.config.headers,
					...options?.headers,
				},
				body: options?.body ? JSON.stringify(options.body) : undefined,
				credentials: 'include', // CRITICAL: Send HTTP_ONLY cookies
			});

			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				throw {
					status: response.status,
					message: error.message || response.statusText,
					code: error.code || 'HTTP_ERROR',
					details: error.details,
				};
			}

			// Handle 204 No Content
			if (response.status === 204) {
				return undefined as ResponseType<M, P>;
			}

			return response.json();
		} catch (error: any) {
			// Re-throw with TransportError format if not already
			if (error.status && error.message && error.code) {
				throw error;
			}

			throw {
				status: 0,
				message: error.message || 'Network error',
				code: 'NETWORK_ERROR',
				details: { originalError: error },
			};
		}
	}

	/**
	 * Subscribe to events (not supported for REST)
	 *
	 * REST transport doesn't support real-time events.
	 * Use WebSocketTransportClient for event subscriptions.
	 *
	 * @throws Error indicating events are not supported
	 */
	subscribe<E extends EventType>(_event: E, _handler: EventHandler<E>): UnsubscribeFunction {
		console.warn('[REST] Event subscriptions not supported. Use WebSocketTransportClient for real-time events.');
		return () => {};
	}

	/**
	 * Subscribe to connection state changes
	 */
	onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
		this.connectionStateHandlers.add(handler);
		return () => this.connectionStateHandlers.delete(handler);
	}

	/**
	 * Update connection state and notify handlers
	 */
	private updateConnectionState(state: ConnectionState): void {
		this.connectionState = state;
		this.connectionStateHandlers.forEach(handler => handler(state));
	}
}
