/**
 * HTTP Polling Transport Client
 *
 * Simple HTTP polling transport for receiving server events via periodic HTTP requests.
 * This is the most basic and compatible transport method.
 *
 * Key Features:
 * - Automatic cookie-based authentication (no manual token passing!)
 * - Automatic token refresh before expiration
 * - Server-side event filtering via subscriptions
 * - Configurable polling interval (default: 5 seconds)
 * - Type-safe event subscriptions
 * - Maximum compatibility (works everywhere HTTP works)
 *
 * How HTTP Polling Works:
 * 1. Client sends HTTP GET request every N seconds (default: 5)
 * 2. Server responds immediately with events (if any) or empty array
 * 3. Client processes events and waits for next poll interval
 * 4. Repeat
 *
 * Differences from Long Polling:
 * - HTTP Polling: Fixed interval, server responds immediately
 * - Long Polling: Server holds connection until events available or timeout
 *
 * Limitations:
 * - Unidirectional: Server → Client only (like SSE)
 * - Higher latency than WebSocket/SSE/Long Polling (depends on poll interval)
 * - More overhead (frequent connections)
 * - Cannot send requests via polling (use REST API instead)
 * - request() method throws error (not supported)
 *
 * Security:
 * - Uses HTTP_ONLY cookies for authentication
 * - Never sends tokens in messages
 * - Browser automatically sends cookies with fetch credentials: 'include'
 * - Token refresh via HTTP with credentials: 'include'
 *
 * @example
 * ```typescript
 * const client = new HttpPollingTransportClient({
 *   baseUrl: 'http://localhost:3000',
 *   pollInterval: 5000, // Poll every 5 seconds
 * });
 *
 * // Connect (starts polling loop)
 * await client.connect();
 *
 * // Subscribe to events (server-side filtering)
 * const unsubscribe = client.subscribe('b2f:task:created', (task) => {
 *   console.log('New task:', task);
 * });
 *
 * // Cleanup
 * unsubscribe();
 * await client.disconnect();
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
	TransportEvent,
	TransportType,
	UnsubscribeFunction,
} from '@shared/transport';

import type { ITransportClient, Subscription, TransportStatus } from '../ITransportClient';
import { TokenRefreshManager } from '../TokenRefreshManager';

/**
 * HTTP Polling Response
 * Server response from HTTP polling endpoint
 */
interface HttpPollingResponse {
	/** Array of events received since last poll */
	events: TransportEvent[];
	/** Whether client is authenticated */
	authenticated?: boolean;
	/** User ID if authenticated */
	userId?: string;
	/** Token expiration timestamp */
	tokenExpiresAt?: number;
}

/**
 * Extended Transport Config with Polling Interval
 */
interface HttpPollingConfig extends TransportConfig {
	/** Polling interval in milliseconds (default: 5000 = 5 seconds) */
	pollInterval?: number;
}

/**
 * HTTP Polling Transport Client
 *
 * Implements ITransportClient using HTTP Polling (short polling) for event streaming.
 *
 * Note: This transport does NOT support request() - use REST API for requests.
 */
export class HttpPollingTransportClient implements ITransportClient {
	/**
	 * Current connection state
	 */
	private connectionState: ConnectionState = 'disconnected';

	/**
	 * Event handlers by event type
	 */
	private eventHandlers = new Map<string, Set<EventHandler<any>>>();

	/**
	 * Event filters by event type
	 * Stores filters for server-side event filtering
	 */
	private eventFilters = new Map<string, Record<string, unknown>>();

	/**
	 * Connection state change handlers
	 */
	private connectionStateHandlers = new Set<ConnectionStateHandler>();

	/**
	 * Token refresh manager
	 */
	private tokenRefreshManager: TokenRefreshManager;

	/**
	 * Polling interval timer
	 */
	private pollingInterval: ReturnType<typeof setInterval> | null = null;

	/**
	 * Flag indicating if connection was ever established successfully
	 */
	private hasConnectedOnce = false;

	/**
	 * Flag to control polling loop
	 */
	private shouldPoll = false;

	/**
	 * Polling interval in milliseconds
	 */
	private pollIntervalMs: number;

	/**
	 * Current polling request abort controller
	 */
	private abortController: AbortController | null = null;

	/**
	 * Create a new HttpPollingTransportClient
	 * @param config - Transport configuration with optional pollInterval
	 */
	constructor(private config: HttpPollingConfig) {
		this.pollIntervalMs = config.pollInterval || 5000; // Default: 5 seconds

		// SECURITY: Token refresh via HTTP
		this.tokenRefreshManager = new TokenRefreshManager({
			refreshEndpoint: `${config.baseUrl}/api/auth/refresh`,
			refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
			onRefreshSuccess: _expiresAt => {
				console.log('[HttpPolling] Token refreshed, connection still valid');
			},
			onRefreshFailed: error => {
				console.error('[HttpPolling] Token refresh failed, triggering re-auth', error);
				this.disconnect();
				window.dispatchEvent(new CustomEvent('auth:refresh_failed'));
			},
		});
	}

	/**
	 * Connect to HTTP polling server
	 *
	 * Starts the polling loop and waits for initial authentication confirmation.
	 *
	 * SECURITY: fetch automatically sends cookies with credentials: 'include'
	 */
	async connect(): Promise<void> {
		if (this.shouldPoll) {
			return; // Already connected
		}

		this.updateConnectionState('connecting');
		this.shouldPoll = true;

		try {
			// First poll will authenticate
			await this.performPoll();

			// Start polling interval
			this.pollingInterval = setInterval(() => {
				this.performPoll().catch(error => {
					console.error('[HttpPolling] Poll failed:', error);
				});
			}, this.pollIntervalMs);
		} catch (error) {
			this.shouldPoll = false;
			throw error;
		}
	}

	/**
	 * Disconnect from HTTP polling server
	 *
	 * Stops the polling loop and cleans up resources.
	 */
	async disconnect(): Promise<void> {
		this.shouldPoll = false;
		this.tokenRefreshManager.stopAutoRefresh();

		if (this.pollingInterval) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = null;
		}

		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

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
		// Note: 'http-polling' is not in the base TransportType, but we use 'http' as closest match
		return 'http';
	}

	/**
	 * Make a type-safe request
	 *
	 * ⚠️ NOT SUPPORTED by HTTP Polling (unidirectional transport)
	 * Use REST API for requests instead.
	 *
	 * @throws Error Always throws - HTTP Polling does not support requests
	 */
	async request<M extends HttpMethod, P extends PathsForMethod<M>>(
		_method: M,
		_path: P,
		_options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>> {
		throw new Error(
			'[HttpPolling] request() is not supported by HTTP Polling transport. ' +
				'HTTP Polling is unidirectional (server→client only). ' +
				'Use REST API for requests.'
		);
	}

	/**
	 * Subscribe to events with server-side filtering
	 */
	subscribe<E extends EventType>(
		event: E,
		handler: EventHandler<E>,
		filters?: Record<string, unknown>
	): UnsubscribeFunction {
		const isFirstSubscription = !this.eventHandlers.has(event);

		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers.get(event)!.add(handler);

		// Store filters for this event
		if (filters) {
			this.eventFilters.set(event, filters);
		}

		// Notify server of subscription (with filters)
		if (isFirstSubscription) {
			this.sendSubscriptionMessage('subscribe', [event], filters);
		}

		return () => {
			this.eventHandlers.get(event)?.delete(handler);

			// If no more handlers, unsubscribe from server
			if (this.eventHandlers.get(event)?.size === 0) {
				this.eventHandlers.delete(event);
				this.eventFilters.delete(event);
				this.sendSubscriptionMessage('unsubscribe', [event]);
			}
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
	 * Subscribe to multiple events in a single request (unified subscription API)
	 */
	async subscribeBatch(events: string[], filters?: Record<string, Record<string, unknown>>): Promise<void> {
		const connId = sessionStorage.getItem('agent_fleet_conn_id');
		if (!connId) {
			throw new Error('No connId found in sessionStorage');
		}

		const response = await fetch(`${this.config.baseUrl}/api/transports/subscriptions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Conn-Id': connId,
			},
			credentials: 'include', // Send cookies for authentication
			body: JSON.stringify({
				action: 'subscribe',
				events,
				filters,
			}),
		});

		if (!response.ok) {
			throw new Error(`Subscription failed: ${response.status} ${response.statusText}`);
		}

		console.log(`[HttpPolling] Subscribed to ${events.length} events`);
	}

	/**
	 * Subscribe to a single event (unified subscription API)
	 */
	async subscribeToEvent(event: string, filters?: Record<string, unknown>): Promise<void> {
		const connId = sessionStorage.getItem('agent_fleet_conn_id');
		if (!connId) {
			throw new Error('No connId found in sessionStorage');
		}

		const response = await fetch(
			`${this.config.baseUrl}/api/transports/subscriptions/${encodeURIComponent(event)}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Conn-Id': connId,
				},
				credentials: 'include', // Send cookies for authentication
				body: JSON.stringify({ filters }),
			}
		);

		if (!response.ok) {
			throw new Error(`Subscription failed: ${response.status} ${response.statusText}`);
		}

		console.log(`[HttpPolling] Subscribed to event: ${event}`);
	}

	/**
	 * Unsubscribe from a single event (unified subscription API)
	 */
	async unsubscribeFromEvent(event: string): Promise<void> {
		const connId = sessionStorage.getItem('agent_fleet_conn_id');
		if (!connId) {
			throw new Error('No connId found in sessionStorage');
		}

		const response = await fetch(
			`${this.config.baseUrl}/api/transports/subscriptions/${encodeURIComponent(event)}`,
			{
				method: 'DELETE',
				headers: {
					'X-Conn-Id': connId,
				},
				credentials: 'include', // Send cookies for authentication
			}
		);

		if (!response.ok) {
			throw new Error(`Unsubscription failed: ${response.status} ${response.statusText}`);
		}

		console.log(`[HttpPolling] Unsubscribed from event: ${event}`);
	}

	/**
	 * Get current subscriptions (unified subscription API)
	 */
	async getSubscriptions(): Promise<Subscription[]> {
		const connId = sessionStorage.getItem('agent_fleet_conn_id');
		if (!connId) {
			throw new Error('No connId found in sessionStorage');
		}

		const response = await fetch(`${this.config.baseUrl}/api/transports/subscriptions`, {
			method: 'GET',
			headers: {
				'X-Conn-Id': connId,
			},
			credentials: 'include', // Send cookies for authentication
		});

		if (!response.ok) {
			throw new Error(`Failed to get subscriptions: ${response.status} ${response.statusText}`);
		}

		const result = await response.json();
		return result.subscriptions || [];
	}

	/**
	 * Get transport status (unified subscription API)
	 */
	async getTransportStatus(): Promise<TransportStatus> {
		const connId = sessionStorage.getItem('agent_fleet_conn_id');
		if (!connId) {
			throw new Error('No connId found in sessionStorage');
		}

		const response = await fetch(`${this.config.baseUrl}/api/transports/status`, {
			method: 'GET',
			headers: {
				'X-Conn-Id': connId,
			},
			credentials: 'include', // Send cookies for authentication
		});

		if (!response.ok) {
			throw new Error(`Failed to get transport status: ${response.status} ${response.statusText}`);
		}

		return await response.json();
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
	 * Send subscription control message to server
	 *
	 * IMPORTANT: If not connected, subscription is queued locally and will be sent
	 * automatically when connection is established (via resubscribeAll()).
	 */
	private sendSubscriptionMessage(
		action: 'subscribe' | 'unsubscribe',
		events: string[],
		filters?: Record<string, unknown>
	): void {
		// Queue subscriptions if not connected yet
		// They will be sent automatically via resubscribeAll() when connected
		if (!this.isConnected()) {
			console.log(`[HttpPolling] Queuing ${action} for ${events[0]} (not connected yet)`);
			return;
		}

		// Use unified subscription API
		if (action === 'subscribe') {
			this.subscribeToEvent(events[0], filters).catch(error => {
				console.error(`[HttpPolling] Failed to subscribe to ${events[0]}:`, error);
			});
		} else {
			this.unsubscribeFromEvent(events[0]).catch(error => {
				console.error(`[HttpPolling] Failed to unsubscribe from ${events[0]}:`, error);
			});
		}
	}

	/**
	 * Perform a single HTTP polling request
	 */
	private async performPoll(): Promise<void> {
		if (!this.shouldPoll) {
			return;
		}

		this.abortController = new AbortController();

		try {
			// Get connId from sessionStorage
			const connId = sessionStorage.getItem('agent_fleet_conn_id');
			if (!connId) {
				throw new Error('No connId found in sessionStorage');
			}

			const response = await fetch(`${this.config.baseUrl}/api/transports/http-polling?connId=${connId}`, {
				method: 'GET',
				credentials: 'include', // Send cookies for authentication
				signal: this.abortController.signal,
			});

			if (!response.ok) {
				if (response.status === 401) {
					// Authentication failed
					window.dispatchEvent(new CustomEvent('auth:failed'));
					throw new Error('Authentication failed');
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// Parse response
			let data: HttpPollingResponse;
			try {
				data = await response.json();
			} catch (jsonError) {
				// Empty or malformed JSON
				console.warn('[HttpPolling] Failed to parse response JSON, using empty events:', jsonError);
				data = {
					events: [],
					authenticated: true,
				};
			}

			// Handle initial authentication
			if (!this.hasConnectedOnce && data.authenticated) {
				console.log(`[HttpPolling] Authenticated as user ${data.userId}`);
				this.hasConnectedOnce = true;
				this.updateConnectionState('connected');

				// Start token refresh
				if (data.tokenExpiresAt) {
					this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
				}

				// Send current subscriptions
				this.resubscribeAll();
			}

			// Handle events
			if (data.events && data.events.length > 0) {
				data.events.forEach(event => this.handleEvent(event));
			}
		} catch (error) {
			// Ignore abort errors (manual disconnect)
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			console.error('[HttpPolling] Polling error:', error);

			// If we were connected, mark as disconnected
			if (this.hasConnectedOnce && this.shouldPoll) {
				this.updateConnectionState('disconnected');
			} else {
				// Initial connection failed
				this.updateConnectionState('error');
				throw error;
			}
		}
	}

	/**
	 * Resubscribe to all events after reconnection
	 */
	private resubscribeAll(): void {
		for (const [event, _handlers] of this.eventHandlers) {
			const filters = this.eventFilters.get(event);
			this.sendSubscriptionMessage('subscribe', [event], filters);
		}
	}

	/**
	 * Handle event message
	 */
	private handleEvent(event: TransportEvent): void {
		const handlers = this.eventHandlers.get(event.type);
		if (handlers) {
			handlers.forEach(handler => {
				try {
					handler(event.data);
				} catch (error) {
					console.error(`[HttpPolling] Error in event handler for ${event.type}:`, error);
				}
			});
		}
	}

	/**
	 * Update connection state and notify listeners
	 */
	private updateConnectionState(state: ConnectionState): void {
		if (this.connectionState === state) {
			return;
		}

		this.connectionState = state;
		console.log(`[HttpPolling] Connection state changed: ${state}`);

		this.connectionStateHandlers.forEach(handler => {
			try {
				handler(state);
			} catch (error) {
				console.error('[HttpPolling] Error in connection state handler:', error);
			}
		});
	}
}
