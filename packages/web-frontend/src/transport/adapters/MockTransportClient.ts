/**
 * Mock Transport Client
 *
 * In-memory mock transport for testing and Storybook. Records all requests and allows
 * manual event triggering.
 *
 * Key Features:
 * - In-memory request/response simulation
 * - Manual event triggering for testing
 * - Request history recording
 * - Configurable response delays
 * - Error simulation
 * - Connection state simulation
 *
 * Use Cases:
 * - Unit tests: Test components in isolation
 * - Storybook: Build stories without backend
 * - Integration tests: Test frontend logic without network
 *
 * @example
 * ```typescript
 * // Basic usage
 * const client = new MockTransportClient();
 *
 * // Configure mock responses
 * client.mockResponse('GET', '/api/tasks/', {
 *   body: [{ id: '1', description: 'Task 1' }]
 * });
 *
 * // Make request
 * const tasks = await client.request('GET', '/api/tasks/');
 * // Returns: [{ id: '1', description: 'Task 1' }]
 *
 * // Trigger event
 * client.emit('b2f:task:created', { id: '2', description: 'Task 2' });
 *
 * // Check request history
 * const history = client.getRequestHistory();
 * console.log(history); // [{ method: 'GET', path: '/api/tasks/', ... }]
 * ```
 *
 * @example
 * ```typescript
 * // Advanced usage with errors
 * const client = new MockTransportClient();
 *
 * // Mock error response
 * client.mockResponse('POST', '/api/tasks/', {
 *   status: 400,
 *   error: {
 *     code: 'VALIDATION_ERROR',
 *     message: 'Description is required'
 *   }
 * });
 *
 * try {
 *   await client.request('POST', '/api/tasks/', { body: {} });
 * } catch (error) {
 *   console.log(error.code); // 'VALIDATION_ERROR'
 * }
 * ```
 */
import type {
	ConnectionState,
	ConnectionStateHandler,
	EventData,
	EventHandler,
	EventType,
	HttpMethod,
	PathsForMethod,
	RequestOptions,
	ResponseType,
	TransportConfig,
	TransportError,
	TransportRequest,
	TransportType,
	UnsubscribeFunction,
} from '@shared/transport';

import type { ITransportClient } from '../ITransportClient';

/**
 * Mock Response Configuration
 */
interface MockResponse {
	status?: number;
	body?: any;
	error?: TransportError;
	delay?: number;
}

/**
 * Mock Transport Client
 *
 * In-memory implementation for testing and Storybook.
 */
export class MockTransportClient implements ITransportClient {
	/**
	 * Current connection state
	 */
	private connectionState: ConnectionState = 'disconnected';

	/**
	 * Connection state change handlers
	 */
	private connectionStateHandlers = new Set<ConnectionStateHandler>();

	/**
	 * Event handlers by event type
	 */
	private eventHandlers = new Map<string, Set<EventHandler<any>>>();

	/**
	 * Request history
	 */
	private requestHistory: TransportRequest[] = [];

	/**
	 * Mock responses by method and path
	 */
	private mockResponses = new Map<string, MockResponse>();

	/**
	 * Default response delay in milliseconds
	 */
	private defaultDelay = 0;

	/**
	 * Create a new MockTransportClient
	 * @param config - Optional transport configuration
	 */
	constructor(private config?: TransportConfig) {}

	/**
	 * Connect (simulated)
	 */
	async connect(): Promise<void> {
		if (this.connectionState === 'connected') {
			return;
		}

		this.updateConnectionState('connecting');

		// Simulate connection delay
		await this.delay(10);

		this.updateConnectionState('connected');
	}

	/**
	 * Disconnect (simulated)
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
		return 'mock';
	}

	/**
	 * Make a mock request
	 */
	async request<M extends HttpMethod, P extends PathsForMethod<M>>(
		method: M,
		path: P,
		options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>> {
		// Record request
		const request: TransportRequest = {
			id: this.generateUuid(),
			method,
			path: path as string,
			// Cast to any to handle test cases with paths not in contract
			query: options?.query as any,
			params: options?.params as any,
			body: options?.body as any,
			headers: options?.headers as any,
			timestamp: Date.now(),
		};

		this.requestHistory.push(request);

		// Get mock response
		const mockKey = this.getMockKey(method, path as string);
		const mockResponse = this.mockResponses.get(mockKey);

		if (!mockResponse) {
			// Default: return empty object
			await this.delay(this.defaultDelay);
			return {} as ResponseType<M, P>;
		}

		// Simulate delay
		await this.delay(mockResponse.delay ?? this.defaultDelay);

		// Simulate error
		if (mockResponse.error) {
			throw mockResponse.error;
		}

		// Return success response
		return mockResponse.body as ResponseType<M, P>;
	}

	/**
	 * Subscribe to events
	 */
	subscribe<E extends EventType>(event: E, handler: EventHandler<E>): UnsubscribeFunction {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers.get(event)!.add(handler);

		return () => {
			this.eventHandlers.get(event)?.delete(handler);
		};
	}

	/**
	 * Subscribe to connection state changes
	 */
	onConnectionStateChange(handler: ConnectionStateHandler): UnsubscribeFunction {
		this.connectionStateHandlers.add(handler);
		return () => this.connectionStateHandlers.delete(handler);
	}

	/**
	 * Get local subscriptions (synchronous)
	 *
	 * Returns event types that have handlers registered locally.
	 * This is a synchronous method that reads from the local eventHandlers map.
	 *
	 * @returns Array of event types with active handlers
	 */
	getLocalSubscriptions(): string[] {
		return Array.from(this.eventHandlers.keys());
	}

	/**
	 * Mock a response for a specific method and path
	 *
	 * @param method - HTTP method
	 * @param path - API path
	 * @param response - Mock response configuration
	 *
	 * @example
	 * ```typescript
	 * client.mockResponse('GET', '/api/tasks/', {
	 *   body: [{ id: '1', description: 'Task 1' }]
	 * });
	 *
	 * client.mockResponse('POST', '/api/tasks/', {
	 *   status: 400,
	 *   error: { code: 'VALIDATION_ERROR', message: 'Invalid data' }
	 * });
	 * ```
	 */
	mockResponse(method: HttpMethod, path: string, response: MockResponse): void {
		const mockKey = this.getMockKey(method, path);
		this.mockResponses.set(mockKey, response);
	}

	/**
	 * Clear a mock response
	 *
	 * @param method - HTTP method
	 * @param path - API path
	 */
	clearMockResponse(method: HttpMethod, path: string): void {
		const mockKey = this.getMockKey(method, path);
		this.mockResponses.delete(mockKey);
	}

	/**
	 * Clear all mock responses
	 */
	clearAllMockResponses(): void {
		this.mockResponses.clear();
	}

	/**
	 * Emit an event to all subscribers
	 *
	 * @param event - Event type
	 * @param data - Event data
	 *
	 * @example
	 * ```typescript
	 * client.emit('b2f:task:created', { id: '1', description: 'New task' });
	 * ```
	 */
	emit<E extends EventType>(event: E, data: EventData<E>): void {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			handlers.forEach(handler => handler(data));
		}
	}

	/**
	 * Get request history
	 *
	 * @returns Array of all recorded requests
	 *
	 * @example
	 * ```typescript
	 * const history = client.getRequestHistory();
	 * expect(history).toHaveLength(2);
	 * expect(history[0].method).toBe('GET');
	 * ```
	 */
	getRequestHistory(): TransportRequest[] {
		return [...this.requestHistory];
	}

	/**
	 * Clear request history
	 */
	clearRequestHistory(): void {
		this.requestHistory = [];
	}

	/**
	 * Get last request
	 *
	 * @returns Last recorded request or undefined
	 *
	 * @example
	 * ```typescript
	 * const lastRequest = client.getLastRequest();
	 * expect(lastRequest?.method).toBe('POST');
	 * expect(lastRequest?.body).toEqual({ description: 'New task' });
	 * ```
	 */
	getLastRequest(): TransportRequest | undefined {
		return this.requestHistory[this.requestHistory.length - 1];
	}

	/**
	 * Find requests by method and path
	 *
	 * @param method - HTTP method to filter by
	 * @param path - Path to filter by (optional)
	 * @returns Array of matching requests
	 *
	 * @example
	 * ```typescript
	 * const postRequests = client.findRequests('POST');
	 * const taskRequests = client.findRequests('GET', '/api/tasks/');
	 * ```
	 */
	findRequests(method: HttpMethod, path?: string): TransportRequest[] {
		return this.requestHistory.filter(req => req.method === method && (!path || req.path === path));
	}

	/**
	 * Set default response delay
	 *
	 * @param delay - Delay in milliseconds
	 *
	 * @example
	 * ```typescript
	 * client.setDefaultDelay(100); // 100ms delay for all responses
	 * ```
	 */
	setDefaultDelay(delay: number): void {
		this.defaultDelay = delay;
	}

	/**
	 * Simulate connection state change
	 *
	 * @param state - New connection state
	 *
	 * @example
	 * ```typescript
	 * client.simulateConnectionState('reconnecting');
	 * // Wait for component to react
	 * client.simulateConnectionState('connected');
	 * ```
	 */
	simulateConnectionState(state: ConnectionState): void {
		this.updateConnectionState(state);
	}

	/**
	 * Update connection state and notify handlers
	 */
	private updateConnectionState(state: ConnectionState): void {
		this.connectionState = state;
		this.connectionStateHandlers.forEach(handler => handler(state));
	}

	/**
	 * Get mock key for method and path
	 */
	private getMockKey(method: HttpMethod, path: string): string {
		return `${method}:${path}`;
	}

	/**
	 * Generate UUID for request ID
	 */
	private generateUuid(): string {
		return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
