/**
 * ===========================================================================================
 * WEBSOCKET TRANSPORT FOR ORCHESTRATOR COMMUNICATION
 * ===========================================================================================
 *
 * Bidirectional WebSocket transport for Backend ↔ Orchestrator communication.
 * Implements the OrchestratorTransport interface.
 *
 * Features:
 * - Request/response correlation using request IDs
 * - Event subscription management
 * - Automatic reconnection with exponential backoff
 * - Request timeout handling (30s default)
 * - Ping/pong heartbeat (every 30s)
 * - Connection state management
 *
 * Protocol:
 * - B→O requests: { type: 'request', payload: B2ORequest }
 * - O→B responses: { type: 'response', payload: B2OResponse }
 * - O→B events: { type: 'event', payload: O2BEvent }
 * - Subscription: { type: 'subscribe', eventTypes: string[] }
 * - Unsubscribe: { type: 'unsubscribe', eventTypes: string[] }
 *
 * ===========================================================================================
 */
import { WebSocket } from 'ws';

import type { B2ORequest, B2OResponse, O2BEvent, O2BEventType } from '@app/shared-orch-backend';

import type { OrchestratorTransport, TransportEventHandler } from './OrchestratorTransport.js';

/**
 * WebSocket message types
 */
interface WSMessage {
	type: 'request' | 'response' | 'event' | 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
	payload?: unknown;
	eventTypes?: string[];
}

/**
 * Pending request awaiting response
 */
interface PendingRequest {
	resolve: (response: B2OResponse) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig {
	/** Orchestrator WebSocket URL (e.g., 'ws://localhost:3737/ws') */
	url: string;
	/** Request timeout in milliseconds (default: 30000) */
	requestTimeout?: number;
	/** Ping interval in milliseconds (default: 30000) */
	pingInterval?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Initial reconnection delay in milliseconds (default: 1000) */
	reconnectDelay?: number;
}

/**
 * WebSocket Transport Implementation
 *
 * Bidirectional WebSocket communication with orchestrator server.
 */
export class WebSocketTransport implements OrchestratorTransport {
	private ws: WebSocket | null = null;
	private connected = false;
	private pendingRequests = new Map<string, PendingRequest>();
	private eventHandler: TransportEventHandler | null = null;
	private subscribedEvents = new Set<string>();
	private pingInterval: NodeJS.Timeout | null = null;
	private reconnectAttempts = 0;
	private reconnectTimeout: NodeJS.Timeout | null = null;
	private shouldReconnect = true;

	private readonly requestTimeout: number;
	private readonly pingIntervalMs: number;
	private readonly maxReconnectAttempts: number;
	private readonly baseReconnectDelay: number;

	constructor(private config: WebSocketTransportConfig) {
		this.requestTimeout = config.requestTimeout ?? 30000;
		this.pingIntervalMs = config.pingInterval ?? 30000;
		this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
		this.baseReconnectDelay = config.reconnectDelay ?? 1000;
	}

	// ===========================================================================================
	// CONNECTION LIFECYCLE
	// ===========================================================================================

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		this.shouldReconnect = true;
		this.reconnectAttempts = 0;

		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(this.config.url);

				this.ws.on('open', () => {
					this.connected = true;
					this.reconnectAttempts = 0;
					console.log(`[WebSocketTransport] Connected to ${this.config.url}`);

					// Start ping/pong heartbeat
					this.startPingPong();

					// Resubscribe to events after reconnection
					if (this.subscribedEvents.size > 0) {
						this.sendSubscription(Array.from(this.subscribedEvents));
					}

					resolve();
				});

				this.ws.on('message', (data: Buffer) => {
					this.handleMessage(data.toString());
				});

				this.ws.on('error', (error: Error) => {
					console.error('[WebSocketTransport] WebSocket error:', error);
					if (!this.connected) {
						reject(error);
					}
				});

				this.ws.on('close', (code: number, reason: Buffer) => {
					this.handleClose(code, reason.toString());
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	async disconnect(): Promise<void> {
		this.shouldReconnect = false;

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		this.stopPingPong();

		if (this.ws) {
			this.ws.close(1000, 'Client disconnect');
			this.ws = null;
		}

		this.connected = false;
		console.log('[WebSocketTransport] Disconnected');
	}

	isConnected(): boolean {
		return this.connected;
	}

	// ===========================================================================================
	// REQUEST/RESPONSE
	// ===========================================================================================

	async request(request: B2ORequest): Promise<B2OResponse> {
		if (!this.connected || !this.ws) {
			throw new Error('WebSocket not connected');
		}

		return new Promise<B2OResponse>((resolve, reject) => {
			// Set up timeout
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(request.id);
				reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
			}, this.requestTimeout);

			// Store pending request
			this.pendingRequests.set(request.id, { resolve, reject, timeout });

			// Send request
			const message: WSMessage = {
				type: 'request',
				payload: request,
			};

			this.ws!.send(JSON.stringify(message), error => {
				if (error) {
					clearTimeout(timeout);
					this.pendingRequests.delete(request.id);
					reject(error);
				}
			});
		});
	}

	// ===========================================================================================
	// EVENT SUBSCRIPTION
	// ===========================================================================================

	subscribe(eventType: O2BEventType): void {
		this.subscribedEvents.add(eventType);

		if (this.connected) {
			this.sendSubscription([eventType]);
		}
	}

	unsubscribe(eventType: O2BEventType): void {
		this.subscribedEvents.delete(eventType);

		if (this.connected) {
			this.sendUnsubscription([eventType]);
		}
	}

	onEvent(handler: TransportEventHandler): void {
		this.eventHandler = handler;
	}

	offEvent(): void {
		this.eventHandler = null;
	}

	// ===========================================================================================
	// MESSAGE HANDLING
	// ===========================================================================================

	private handleMessage(data: string): void {
		try {
			const message: WSMessage = JSON.parse(data);

			switch (message.type) {
				case 'response':
					this.handleResponse(message.payload as B2OResponse);
					break;

				case 'event':
					this.handleEvent(message.payload as O2BEvent);
					break;

				case 'pong':
					// Heartbeat acknowledged
					break;

				default:
					console.warn('[WebSocketTransport] Unknown message type:', message.type);
			}
		} catch (error) {
			console.error('[WebSocketTransport] Failed to parse message:', error);
		}
	}

	private handleResponse(response: B2OResponse): void {
		const pending = this.pendingRequests.get(response.id);

		if (!pending) {
			console.warn('[WebSocketTransport] Received response for unknown request:', response.id);
			return;
		}

		clearTimeout(pending.timeout);
		this.pendingRequests.delete(response.id);

		pending.resolve(response);
	}

	private handleEvent(event: O2BEvent): void {
		if (this.eventHandler) {
			try {
				this.eventHandler(event);
			} catch (error) {
				console.error('[WebSocketTransport] Event handler error:', error);
			}
		}
	}

	private handleClose(code: number, reason: string): void {
		this.connected = false;
		this.stopPingPong();

		console.log(`[WebSocketTransport] Connection closed: code=${code}, reason=${reason}`);

		// Reject all pending requests
		this.pendingRequests.forEach(pending => {
			clearTimeout(pending.timeout);
			pending.reject(new Error('WebSocket connection closed'));
		});
		this.pendingRequests.clear();

		// Attempt reconnection
		if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
			this.scheduleReconnect();
		} else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('[WebSocketTransport] Max reconnection attempts reached');
		}
	}

	// ===========================================================================================
	// RECONNECTION
	// ===========================================================================================

	private scheduleReconnect(): void {
		if (this.reconnectTimeout) {
			return;
		}

		this.reconnectAttempts++;
		const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
		const maxDelay = 30000; // Cap at 30 seconds
		const actualDelay = Math.min(delay, maxDelay);

		console.log(
			`[WebSocketTransport] Reconnecting in ${actualDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
		);

		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null;
			this.connect().catch(error => {
				console.error('[WebSocketTransport] Reconnection failed:', error);
			});
		}, actualDelay);
	}

	// ===========================================================================================
	// SUBSCRIPTION MESSAGES
	// ===========================================================================================

	private sendSubscription(eventTypes: string[]): void {
		if (!this.ws || !this.connected) {
			return;
		}

		const message: WSMessage = {
			type: 'subscribe',
			eventTypes,
		};

		this.ws.send(JSON.stringify(message), error => {
			if (error) {
				console.error('[WebSocketTransport] Failed to send subscription:', error);
			} else {
				console.log('[WebSocketTransport] Subscribed to:', eventTypes);
			}
		});
	}

	private sendUnsubscription(eventTypes: string[]): void {
		if (!this.ws || !this.connected) {
			return;
		}

		const message: WSMessage = {
			type: 'unsubscribe',
			eventTypes,
		};

		this.ws.send(JSON.stringify(message), error => {
			if (error) {
				console.error('[WebSocketTransport] Failed to send unsubscription:', error);
			} else {
				console.log('[WebSocketTransport] Unsubscribed from:', eventTypes);
			}
		});
	}

	// ===========================================================================================
	// PING/PONG HEARTBEAT
	// ===========================================================================================

	private startPingPong(): void {
		this.stopPingPong();

		this.pingInterval = setInterval(() => {
			if (this.ws && this.connected) {
				const message: WSMessage = { type: 'ping' };
				this.ws.send(JSON.stringify(message), error => {
					if (error) {
						console.error('[WebSocketTransport] Failed to send ping:', error);
					}
				});
			}
		}, this.pingIntervalMs);
	}

	private stopPingPong(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}
}
