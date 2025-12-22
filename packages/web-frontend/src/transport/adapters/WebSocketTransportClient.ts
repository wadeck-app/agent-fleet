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
 *   reconnectMaxAttempts: 10
 * });
 *
 * // Connect (automatic authentication)
 * await client.connect();
 *
 * // Make requests
 * const tasks = await client.request('GET', '/api/tasks/');
 *
 * // Subscribe to events (server-side filtering)
 * const unsubscribe = client.subscribe('task:created', (task) => {
 *   console.log('New task:', task);
 * });
 *
 * // Cleanup
 * unsubscribe();
 * await client.disconnect();
 * ```
 */
import type {
	SubscriptionMessage,
	TransportEvent,
	TransportRequest,
	TransportResponse,
} from 'shared-frontend-backend/transport';
import type {
	ConnectionState,
	ConnectionStateHandler,
	EventHandler,
	EventType,
	HttpMethod,
	PathsForMethod,
	RequestOptions,
	ResponseType,
	TransportType,
	UnsubscribeFunction,
} from 'shared-frontend-backend/transport';

import type { ITransportClient, TransportConfig } from '../ITransportClient';
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

			// SECURITY: WebSocket automatically sends cookies from same origin
			// No need to pass tokens manually!
			this.ws = new WebSocket(`${wsUrl}/ws`);

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
	 */
	subscribe<E extends EventType>(event: E, handler: EventHandler<E>): UnsubscribeFunction {
		const isFirstSubscription = !this.eventHandlers.has(event);

		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers.get(event)!.add(handler);

		// Notify server of subscription
		if (isFirstSubscription) {
			this.sendSubscriptionMessage('subscribe', [event]);
		}

		return () => {
			this.eventHandlers.get(event)?.delete(handler);

			// If no more handlers, unsubscribe from server
			if (this.eventHandlers.get(event)?.size === 0) {
				this.eventHandlers.delete(event);
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
	 * Send subscription control message to server
	 */
	private sendSubscriptionMessage(action: 'subscribe' | 'unsubscribe', events: string[]): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const message: SubscriptionMessage = {
			type: 'subscription',
			action,
			events,
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

	/**
	 * Handle reconnection with exponential backoff
	 */
	private handleReconnect(): void {
		if (!this.config.reconnect) {
			return;
		}

		if (this.reconnectAttempts >= (this.config.reconnectMaxAttempts || 10)) {
			console.error('[WS] Max reconnection attempts reached');
			this.updateConnectionState('error');
			return;
		}

		this.updateConnectionState('reconnecting');
		this.reconnectAttempts++;

		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
		const delay = Math.min((this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1), 30000);

		console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

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
