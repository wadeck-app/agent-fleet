/**
 * Server-Sent Events (SSE) Transport Client
 *
 * Unidirectional real-time transport using Server-Sent Events (EventSource)
 * for receiving server-pushed events with automatic authentication and reconnection.
 *
 * Key Features:
 * - Automatic cookie-based authentication (no manual token passing!)
 * - Automatic token refresh before expiration
 * - Server-side event filtering via subscriptions
 * - Automatic reconnection with exponential backoff
 * - Type-safe event subscriptions
 * - Lightweight compared to WebSocket (events-only)
 *
 * Limitations:
 * - Unidirectional: Server → Client only
 * - Cannot send requests via SSE (use REST API instead)
 * - request() method throws error (not supported)
 *
 * Security:
 * - Uses HTTP_ONLY cookies for authentication
 * - Never sends tokens in SSE messages
 * - Browser automatically sends cookies during SSE connection
 * - Token refresh via HTTP with credentials: 'include'
 *
 * @example
 * ```typescript
 * const client = new SSETransportClient({
 *   baseUrl: 'http://localhost:3000',
 *   reconnect: true,
 *   reconnectMaxAttempts: 10
 * });
 *
 * // Connect (automatic authentication)
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

import type { ITransportClient, TransportStatus } from '../ITransportClient';
import { TokenRefreshManager } from '../TokenRefreshManager';
import { getConnId } from '../connection-id';

/**
 * SSE Transport Client
 *
 * Implements ITransportClient using Server-Sent Events (EventSource) for
 * unidirectional real-time event streaming.
 *
 * Note: This transport does NOT support request() - use REST API for requests.
 */
export class SSETransportClient implements ITransportClient {
	/**
	 * EventSource instance
	 */
	private eventSource: EventSource | null = null;

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
	 * Reconnection attempt counter
	 */
	private reconnectAttempts = 0;

	/**
	 * Reconnection timer
	 */
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Flag indicating if connection was ever established successfully
	 * Used to determine reconnection strategy
	 */
	private hasConnectedOnce = false;

	/**
	 * Flag to prevent reconnection during manual disconnect
	 */
	private shouldReconnect = true;

	/**
	 * Create a new SSETransportClient
	 * @param config - Transport configuration
	 */
	constructor(private config: TransportConfig) {
		// SECURITY: Token refresh via HTTP (not via SSE!)
		this.tokenRefreshManager = new TokenRefreshManager({
			refreshEndpoint: `${config.baseUrl}/api/auth/refresh`,
			refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
			onRefreshSuccess: _expiresAt => {
				console.log('[SSE] Token refreshed, connection still valid');
			},
			onRefreshFailed: error => {
				console.error('[SSE] Token refresh failed, triggering re-auth', error);
				this.disconnect();
				window.dispatchEvent(new CustomEvent('auth:refresh_failed'));
			},
		});
	}

	private debugSeed = 1;

	/**
	 * Connect to SSE server
	 *
	 * SECURITY: EventSource automatically sends cookies from same origin.
	 * No need to pass tokens manually!
	 */
	async connect(): Promise<void> {
		if (this.eventSource?.readyState === EventSource.OPEN) {
			return;
		}

		const debugRan = `${this.debugSeed++}_${Math.round(1000 + Math.random() * 9000)}`;

		this.updateConnectionState('connecting');
		this.shouldReconnect = true;

		return new Promise((resolve, reject) => {
			// Get connId from sessionStorage
			const connId = getConnId();
			if (!connId) {
				console.info(`[SSE] ${debugRan} No connId`);
				reject(new Error('No connId found in sessionStorage'));
				return;
			}

			const sseUrl = `${this.config.baseUrl}/api/transports/sse?connId=${connId}`;

			// SECURITY: EventSource automatically sends cookies from same origin
			// No need to pass tokens manually!
			// Note: withCredentials option enables CORS cookies if needed
			this.eventSource = new EventSource(sseUrl, { withCredentials: true });

			const timeout = setTimeout(() => {
				console.info(`[SSE] ${debugRan} Connection timeout`);
				reject(new Error('Connection timeout'));
				this.eventSource?.close();
			}, this.config.connectionTimeout || 10000);

			this.eventSource.onopen = () => {
				console.log(`[SSE] ${debugRan} Connection opened, waiting for auth confirmation...`);
			};

			// Handle 'connected' event for authentication confirmation
			this.eventSource.addEventListener('connected', event => {
				const data = JSON.parse((event as MessageEvent).data);
				clearTimeout(timeout);
				this.updateConnectionState('connected');
				this.reconnectAttempts = 0;
				this.hasConnectedOnce = true;

				console.log(`[SSE] ${debugRan} Authenticated as user ${data.userId}`);

				// SECURITY: Start automatic token refresh
				if (data.tokenExpiresAt) {
					this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
				}

				// Send current subscriptions to server
				console.info(`[SSE] ${debugRan} resubscribeAll`);
				this.resubscribeAll();

				resolve();
			});

			// Handle 'auth_error' event
			this.eventSource.addEventListener('auth_error', event => {
				const data = JSON.parse((event as MessageEvent).data);
				clearTimeout(timeout);
				reject(new Error(data.message || 'Authentication failed'));
				window.dispatchEvent(new CustomEvent('auth:failed'));
			});

			// Handle 'token_expiring_soon' event
			this.eventSource.addEventListener('token_expiring_soon', () => {
				console.warn(`[SSE] ${debugRan} Token expiring soon, refreshing immediately...`);
				this.tokenRefreshManager.refreshToken().catch(err => {
					console.error(`[SSE] ${debugRan} Failed to refresh token on warning`, err);
				});
			});

			// Handle 'token_expired' event
			this.eventSource.addEventListener('token_expired', () => {
				console.error(`[SSE] ${debugRan} Token expired, disconnecting`);
				this.eventSource?.close();
				window.dispatchEvent(new CustomEvent('auth:token_expired'));
			});

			// Handle 'subscription_updated' event
			this.eventSource.addEventListener('subscription_updated', event => {
				const data = JSON.parse((event as MessageEvent).data);
				console.log(`[SSE] ${debugRan} Subscription ${data.action}:`, data.events);
			});

			// Handle regular messages (events)
			this.eventSource.onmessage = event => {
				console.info(`[SSE] ${debugRan} onmessage`, event);
				this.handleMessage(event);
			};

			this.eventSource.onerror = error => {
				console.error(`[SSE] ${debugRan} Connection error`, error);

				// EventSource will automatically try to reconnect
				// But we want to manage reconnection ourselves for better control
				if (this.eventSource?.readyState === EventSource.CLOSED) {
					if (timeout) {
						clearTimeout(timeout);
					}
					this.updateConnectionState('disconnected');
					this.tokenRefreshManager.stopAutoRefresh();

					// Only reject if we haven't connected yet
					if (!this.hasConnectedOnce) {
						reject(error);
					}

					this.handleReconnect();
				}
			};
		});
	}

	/**
	 * Disconnect from SSE server
	 */
	async disconnect(): Promise<void> {
		this.shouldReconnect = false;
		this.tokenRefreshManager.stopAutoRefresh();

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
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
	 * Check if connection is in progress
	 */
	isConnecting(): boolean {
		return this.connectionState === 'connecting';
	}

	/**
	 * Get transport type
	 */
	getTransportType(): TransportType {
		return 'sse';
	}

	/**
	 * Force manual downgrade to REST polling
	 * Stops SSE reconnection attempts and switches to 'manual_downgrade' state
	 */
	forceDowngrade(): void {
		console.log('[SSE] User requested manual downgrade to REST');

		this.shouldReconnect = false;
		this.tokenRefreshManager.stopAutoRefresh();

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.updateConnectionState('manual_downgrade');
	}

	/**
	 * Get next reconnection delay in seconds
	 * Returns 0 if not reconnecting
	 */
	getReconnectDelay(): number {
		if (this.connectionState !== 'reconnecting') {
			return 0;
		}

		// Calculate delay with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
		const delayMs = Math.min((this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1), 30000);
		return Math.round(delayMs / 1000);
	}

	/**
	 * Make a type-safe request
	 *
	 *  NOT SUPPORTED by SSE (unidirectional transport)
	 * Use REST API for requests instead.
	 *
	 * @throws Error Always throws - SSE does not support requests
	 */
	async request<M extends HttpMethod, P extends PathsForMethod<M>>(
		_method: M,
		_path: P,
		_options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>> {
		throw new Error(
			'[SSE] request() is not supported by SSE transport. ' +
				'SSE is unidirectional (server→client only). ' +
				'Use REST API for requests.'
		);
	}

	/**
	 * Subscribe to events with server-side filtering
	 *
	 * @param event - Event type to subscribe to
	 * @param handler - Event handler function
	 * @param filters - Optional filters for server-side filtering
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
		const connId = getConnId();
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

		console.log(`[SSE] Subscribed to ${events.length} events`);
	}

	/**
	 * Subscribe to a single event (unified subscription API)
	 */
	async subscribeToEvent(event: string, filters?: Record<string, unknown>): Promise<void> {
		const connId = getConnId();
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

		console.log(`[SSE] Subscribed to event: ${event}`);
	}

	/**
	 * Unsubscribe from a single event (unified subscription API)
	 */
	async unsubscribeFromEvent(event: string): Promise<void> {
		const connId = getConnId();
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

		console.log(`[SSE] Unsubscribed from event: ${event}`);
	}

	/**
	 * Get current subscriptions (unified subscription API)
	 */
	async getSubscriptions(): Promise<Array<{ event: string; filters?: Record<string, unknown> }>> {
		const connId = getConnId();
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
		const connId = getConnId();
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
	 * Since SSE is unidirectional, we send subscription via HTTP POST
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
			console.log(`[SSE] Queuing ${action} for ${events[0]} (not connected yet)`);
			return;
		}

		// Use unified subscription API
		if (action === 'subscribe') {
			this.subscribeToEvent(events[0], filters).catch(error => {
				console.error(`[SSE] Failed to subscribe to ${events[0]}:`, error);
			});
		} else {
			this.unsubscribeFromEvent(events[0]).catch(error => {
				console.error(`[SSE] Failed to unsubscribe from ${events[0]}:`, error);
			});
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
	 * Handle incoming SSE message
	 */
	private handleMessage(event: MessageEvent): void {
		try {
			const data = JSON.parse(event.data);
			if (this.isEvent(data)) {
				this.handleEvent(data as TransportEvent);
			}
		} catch (error) {
			console.error('[SSE] Failed to parse message:', error);
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
					console.error(`[SSE] Error in event handler for ${event.type}:`, error);
				}
			});
		}
	}

	/**
	 * Check if message is an event
	 */
	private isEvent(data: unknown): boolean {
		return (
			typeof data === 'object' &&
			data !== null &&
			'type' in data &&
			'data' in data &&
			'timestamp' in data &&
			typeof (data as { type: unknown }).type === 'string'
		);
	}

	/**
	 * Handle reconnection logic
	 */
	private handleReconnect(): void {
		if (!this.shouldReconnect) {
			console.log('[SSE] Reconnection disabled (manual disconnect)');
			return;
		}

		if (!this.config.reconnect) {
			console.log('[SSE] Reconnection disabled by config');
			this.updateConnectionState('error');
			return;
		}

		// Reconnection strategy:
		// - If never connected: Limited attempts (SSE might not be supported)
		// - If connected once: Infinite attempts (backend likely temporarily down)
		const maxAttempts = this.hasConnectedOnce ? Infinity : this.config.reconnectMaxAttempts || 3;

		if (this.reconnectAttempts >= maxAttempts) {
			console.error('[SSE] Max reconnection attempts reached');
			this.updateConnectionState('error');
			return;
		}

		this.reconnectAttempts++;
		this.updateConnectionState('reconnecting');

		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
		const delay = Math.min((this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1), 30000);

		console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})...`);

		this.reconnectTimer = setTimeout(() => {
			console.log('[SSE] Attempting reconnection...');
			this.connect().catch(error => {
				console.error('[SSE] Reconnection failed:', error);
			});
		}, delay);
	}

	/**
	 * Update connection state and notify listeners
	 */
	private updateConnectionState(state: ConnectionState): void {
		if (this.connectionState === state) {
			return;
		}

		this.connectionState = state;
		console.log(`[SSE] Connection state changed: ${state}`);

		this.connectionStateHandlers.forEach(handler => {
			try {
				handler(state);
			} catch (error) {
				console.error('[SSE] Error in connection state handler:', error);
			}
		});
	}
}
