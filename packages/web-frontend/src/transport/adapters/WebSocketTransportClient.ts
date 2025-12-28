/**
 * WebSocket Transport Client
 *
 * Real-time bidirectional transport using WebSocket with automatic authentication,
 * token refresh, subscription management, and reconnection.
 *
 * Key Features:
 * - Automatic cookie-based authentication (no manual token passing!)
 * - Automatic token refresh before expiration
 * - Server-side event filtering via subscriptions
 * - Automatic reconnection with exponential backoff
 * - Type-safe requests and events
 * - Pending request tracking with timeout
 *
 * Security:
 * - Uses HTTP_ONLY cookies for authentication
 * - Never sends tokens in WebSocket messages
 * - Browser automatically sends cookies during WebSocket upgrade
 * - Token refresh via HTTP with credentials: 'include'
 *
 * @example
 * ```typescript
 * const client = new WebSocketTransportClient({
 *   baseUrl: 'http://localhost:3000',
 *   wsUrl: 'ws://localhost:3000',
 *   reconnect: true,
 *   reconnectMaxAttempts: 3
 * });
 *
 * // Connect (automatic authentication)
 * await client.connect();
 *
 * // Make requests
 * const tasks = await client.request('GET', '/api/tasks/');
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
	SubscriptionMessage,
	TransportConfig,
	TransportEvent,
	TransportRequest,
	TransportResponse,
	TransportType,
	UnsubscribeFunction,
} from '@shared/transport';

import type { ITransportClient, TransportStatus } from '../ITransportClient';
import { TokenRefreshManager } from '../TokenRefreshManager';

/**
 * Pending Request
 * Tracks a request waiting for a response
 */
interface PendingRequest {
	resolve: (value: any) => void;
	reject: (error: any) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * WebSocket Transport Client
 *
 * Implements ITransportClient using WebSocket for real-time communication.
 */
export class WebSocketTransportClient implements ITransportClient {
	/**
	 * WebSocket instance
	 */
	private ws: WebSocket | null = null;

	/**
	 * Current connection state
	 */
	private connectionState: ConnectionState = 'disconnected';

	/**
	 * Pending requests waiting for responses
	 */
	private pendingRequests = new Map<string, PendingRequest>();

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
	 * Used to determine reconnection strategy:
	 * - If true: infinite reconnection attempts (backend likely temporarily down)
	 * - If false: limited attempts (WebSocket might not be supported)
	 */
	private hasConnectedOnce = false;

	/**
	 * Create a new WebSocketTransportClient
	 * @param config - Transport configuration
	 */
	constructor(private config: TransportConfig) {
		// SECURITY: Token refresh via HTTP (not via WebSocket!)
		this.tokenRefreshManager = new TokenRefreshManager({
			refreshEndpoint: `${config.baseUrl}/api/auth/refresh`,
			refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
			onRefreshSuccess: _expiresAt => {
				console.log('[WS] Token refreshed, connection still valid');
			},
			onRefreshFailed: error => {
				console.error('[WS] Token refresh failed, triggering re-auth', error);
				this.disconnect();
				window.dispatchEvent(new CustomEvent('auth:refresh_failed'));
			},
		});
	}

	/**
	 * Connect to WebSocket server
	 *
	 * SECURITY: WebSocket automatically sends cookies from same origin during upgrade.
	 * No need to pass tokens manually!
	 */
	async connect(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) {
			return;
		}

		this.updateConnectionState('connecting');

		return new Promise((resolve, reject) => {
			const wsUrl = this.config.wsUrl || this.config.baseUrl.replace(/^http/, 'ws');

			// Get connId from sessionStorage for request correlation (unique per tab)
			const connId = sessionStorage.getItem('agent_fleet_conn_id');
			const wsUrlWithConnId = connId
				? `${wsUrl}/api/transports/ws?connId=${connId}`
				: `${wsUrl}/api/transports/ws`;

			// SECURITY: WebSocket automatically sends cookies from same origin
			// No need to pass tokens manually!
			this.ws = new WebSocket(wsUrlWithConnId);

			const timeout = setTimeout(() => {
				reject(new Error('Connection timeout'));
				this.ws?.close();
			}, this.config.connectionTimeout || 10000);

			this.ws.onopen = () => {
				console.log('[WS] Connection opened, waiting for auth confirmation...');
			};

			this.ws.onmessage = event => {
				const data = JSON.parse(event.data);

				// Handle initial connection message
				if (data.type === 'connected') {
					clearTimeout(timeout);
					this.updateConnectionState('connected');
					this.reconnectAttempts = 0;
					this.hasConnectedOnce = true; // Mark that connection was successful

					console.log(`[WS] Authenticated as user ${data.userId}`);

					// SECURITY: Start automatic token refresh
					if (data.tokenExpiresAt) {
						this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
					}

					resolve();
					return;
				}

				// Handle auth error
				if (data.type === 'auth_error') {
					clearTimeout(timeout);
					reject(new Error(data.message || 'Authentication failed'));
					window.dispatchEvent(new CustomEvent('auth:failed'));
					return;
				}

				// Handle token expiring warning
				if (data.type === 'token_expiring_soon') {
					console.warn('[WS] Token expiring soon, refreshing immediately...');
					this.tokenRefreshManager.refreshToken().catch(err => {
						console.error('[WS] Failed to refresh token on warning', err);
					});
					return;
				}

				// Handle token expired (force disconnect)
				if (data.type === 'token_expired') {
					console.error('[WS] Token expired, disconnecting');
					this.ws?.close();
					window.dispatchEvent(new CustomEvent('auth:token_expired'));
					return;
				}

				// Handle subscription confirmation
				if (data.type === 'subscription_updated') {
					console.log(`[WS] Subscription ${data.action}:`, data.events);
					return;
				}

				// Regular message handling
				this.handleMessage(event);
			};

			this.ws.onerror = error => {
				clearTimeout(timeout);
				this.updateConnectionState('error');
				console.error('[WS] Connection error', error);
				reject(error);
			};

			this.ws.onclose = () => {
				console.log('[WS] Connection closed');
				this.updateConnectionState('disconnected');
				this.tokenRefreshManager.stopAutoRefresh();
				this.handleReconnect();
			};
		});
	}

	/**
	 * Disconnect from WebSocket server
	 */
	async disconnect(): Promise<void> {
		this.tokenRefreshManager.stopAutoRefresh();

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
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
		return 'websocket';
	}

	/**
	 * Force manual downgrade to REST polling
	 * Stops WebSocket reconnection attempts and switches to 'manual_downgrade' state
	 */
	forceDowngrade(): void {
		console.log('[WS] User requested manual downgrade to REST');

		// Stop token refresh
		this.tokenRefreshManager.stopAutoRefresh();

		// Stop any pending reconnection
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		// Close current connection if exists
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		// Update to manual_downgrade state
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
	 */
	async request<M extends HttpMethod, P extends PathsForMethod<M>>(
		method: M,
		path: P,
		options?: RequestOptions<M, P>
	): Promise<ResponseType<M, P>> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}

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

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(request.id);
				reject(new Error('Request timeout'));
			}, this.config.requestTimeout || 30000);

			this.pendingRequests.set(request.id, { resolve, reject, timeout });
			this.ws!.send(JSON.stringify(request));
		});
	}

	/**
	 * Subscribe to events with server-side filtering
	 *
	 * @param event - Event type to subscribe to
	 * @param handler - Event handler function
	 * @param filters - Optional filters for server-side filtering
	 *                  Example: { workerId: 'worker-123', status: 'IN_PROGRESS' }
	 *                  Backend will only send events matching ALL specified filters
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
	 *
	 * For WebSocket, this uses internal message passing instead of HTTP endpoints.
	 */
	async subscribeBatch(events: string[], filters?: Record<string, Record<string, unknown>>): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}

		// For WebSocket, we send subscription messages via the WebSocket connection
		for (const event of events) {
			const eventFilters = filters?.[event];
			this.sendSubscriptionMessage('subscribe', [event], eventFilters);
		}

		console.log(`[WS] Subscribed to ${events.length} events via WebSocket messages`);
	}

	/**
	 * Subscribe to a single event (unified subscription API)
	 *
	 * For WebSocket, this uses internal message passing instead of HTTP endpoints.
	 */
	async subscribeToEvent(event: string, filters?: Record<string, unknown>): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}

		this.sendSubscriptionMessage('subscribe', [event], filters);
		console.log(`[WS] Subscribed to event: ${event}`);
	}

	/**
	 * Unsubscribe from a single event (unified subscription API)
	 *
	 * For WebSocket, this uses internal message passing instead of HTTP endpoints.
	 */
	async unsubscribeFromEvent(event: string): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}

		this.sendSubscriptionMessage('unsubscribe', [event]);
		console.log(`[WS] Unsubscribed from event: ${event}`);
	}

	/**
	 * Get current subscriptions (unified subscription API)
	 *
	 * For WebSocket, returns local subscription state.
	 */
	async getSubscriptions(): Promise<Array<{ event: string; filters?: Record<string, unknown> }>> {
		const subscriptions: Array<{ event: string; filters?: Record<string, unknown> }> = [];

		for (const [event, _handlers] of this.eventHandlers) {
			const filters = this.eventFilters.get(event);
			subscriptions.push({ event, filters });
		}

		return subscriptions;
	}

	/**
	 * Get transport status (unified subscription API)
	 *
	 * Note: WebSocket client doesn't have direct access to server-side status.
	 * This returns a client-side representation.
	 */
	async getTransportStatus(): Promise<TransportStatus> {
		// WebSocket doesn't have a dedicated status endpoint, return client-side info
		return {
			clientId: 'ws-client', // WebSocket doesn't expose client ID on client side
			userId: 'unknown', // Would need to store from connection message
			transportType: 'websocket',
			connected: this.isConnected(),
			authenticatedAt: 0, // Not tracked client-side
			lastActivity: Date.now(),
			subscriptions: Array.from(this.eventHandlers.keys()),
			queuedEvents: 0, // Not tracked client-side
		};
	}

	/**
	 * Send subscription control message to server
	 *
	 * @param action - Subscribe or unsubscribe action
	 * @param events - Array of event types
	 * @param filters - Optional filters for server-side filtering
	 */
	private sendSubscriptionMessage(
		action: 'subscribe' | 'unsubscribe',
		events: string[],
		filters?: Record<string, unknown>
	): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const message: SubscriptionMessage = {
			type: 'subscription',
			action,
			events,
			filters,
		};

		this.ws.send(JSON.stringify(message));
	}

	/**
	 * Handle incoming WebSocket message
	 */
	private handleMessage(event: MessageEvent): void {
		const data = JSON.parse(event.data);

		if (this.isResponse(data)) {
			this.handleResponse(data as TransportResponse);
		} else if (this.isEvent(data)) {
			this.handleEvent(data as TransportEvent);
		}
	}

	/**
	 * Handle response message
	 */
	private handleResponse(response: TransportResponse): void {
		const pending = this.pendingRequests.get(response.id);
		if (!pending) {
			return;
		}

		this.pendingRequests.delete(response.id);
		clearTimeout(pending.timeout);

		if (response.error) {
			pending.reject(response.error);
		} else {
			pending.resolve(response.body);
		}
	}

	/**
	 * Handle event message
	 */
	private handleEvent(event: TransportEvent): void {
		const handlers = this.eventHandlers.get(event.type);
		if (handlers) {
			handlers.forEach(handler => handler(event.data));
		}
	}

	private reconnectMaxAttempts() {
		return this.config.reconnectMaxAttempts || 3;
	}

	/**
	 * Handle reconnection with exponential backoff
	 *
	 * Strategy:
	 * - If hasConnectedOnce: infinite reconnection attempts (backend likely down temporarily)
	 * - If !hasConnectedOnce: limited attempts (WebSocket might not be supported)
	 */
	private handleReconnect(): void {
		if (!this.config.reconnect) {
			return;
		}

		// Only enforce max attempts if we never connected successfully
		// If we did connect once, keep trying indefinitely (backend likely just restarting)
		if (!this.hasConnectedOnce && this.reconnectAttempts >= this.reconnectMaxAttempts()) {
			console.error('[WS] Max reconnection attempts reached (never connected)');
			this.updateConnectionState('error');
			return;
		}

		this.updateConnectionState('reconnecting');
		this.reconnectAttempts++;

		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
		const delay = Math.min((this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1), 30000);

		const attemptInfo = this.hasConnectedOnce
			? `attempt ${this.reconnectAttempts} (infinite retry)`
			: `attempt ${this.reconnectAttempts}/${this.reconnectMaxAttempts()}`;
		console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (${attemptInfo})`);

		this.reconnectTimer = setTimeout(() => {
			this.connect().catch(err => {
				console.error('[WS] Reconnection failed', err);
			});
		}, delay);
	}

	/**
	 * Update connection state and notify handlers
	 */
	private updateConnectionState(state: ConnectionState): void {
		this.connectionState = state;
		this.connectionStateHandlers.forEach(handler => handler(state));
	}

	/**
	 * Check if data is a response
	 */
	private isResponse(data: any): boolean {
		return 'id' in data && 'status' in data;
	}

	/**
	 * Check if data is an event
	 */
	private isEvent(data: any): boolean {
		return 'type' in data && 'data' in data && !('status' in data);
	}

	/**
	 * Generate UUID for request ID
	 */
	private generateUuid(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}
