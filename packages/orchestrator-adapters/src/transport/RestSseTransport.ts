/**
 * ===========================================================================================
 * REST + SSE TRANSPORT FOR ORCHESTRATOR COMMUNICATION
 * ===========================================================================================
 *
 * Hybrid transport using REST for requests and Server-Sent Events for events.
 * Implements the OrchestratorTransport interface.
 *
 * Features:
 * - HTTP POST requests for B→O requests
 * - Server-Sent Events (SSE) for O→B events
 * - Automatic SSE reconnection
 * - Event subscription management
 * - Request timeout handling
 *
 * Endpoints:
 * - POST /orchestrator/request - Send B→O requests
 * - GET /orchestrator/events - SSE stream for O→B events
 *
 * Protocol:
 * - Request: POST { method, params } → Response: { result } or { error }
 * - Events: SSE stream with event data as JSON
 *
 * ===========================================================================================
 */

import type { B2ORequest, B2OResponse, O2BEvent, O2BEventType } from '@app/shared-orch-backend';

import type { OrchestratorTransport, TransportEventHandler } from './OrchestratorTransport.js';

/**
 * REST + SSE transport configuration
 */
export interface RestSseTransportConfig {
	/** Base URL of orchestrator server (e.g., 'http://localhost:3737') */
	baseUrl: string;
	/** Request timeout in milliseconds (default: 30000) */
	requestTimeout?: number;
	/** SSE reconnection delay in milliseconds (default: 1000) */
	sseReconnectDelay?: number;
}

/**
 * REST + SSE Transport Implementation
 *
 * Uses REST for requests and Server-Sent Events for event streaming.
 */
export class RestSseTransport implements OrchestratorTransport {
	private connected = false;
	private eventSource: EventSource | null = null;
	private eventHandler: TransportEventHandler | null = null;
	private subscribedEvents = new Set<string>();
	private shouldReconnect = true;

	private readonly requestTimeout: number;
	private readonly sseReconnectDelay: number;

	constructor(private config: RestSseTransportConfig) {
		this.requestTimeout = config.requestTimeout ?? 30000;
		this.sseReconnectDelay = config.sseReconnectDelay ?? 1000;
	}

	// ===========================================================================================
	// CONNECTION LIFECYCLE
	// ===========================================================================================

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		this.shouldReconnect = true;
		await this.connectSSE();
		this.connected = true;

		console.log(`[RestSseTransport] Connected to ${this.config.baseUrl}`);
	}

	async disconnect(): Promise<void> {
		this.shouldReconnect = false;
		this.disconnectSSE();
		this.connected = false;

		console.log('[RestSseTransport] Disconnected');
	}

	isConnected(): boolean {
		return this.connected;
	}

	// ===========================================================================================
	// REQUEST/RESPONSE
	// ===========================================================================================

	async request(request: B2ORequest): Promise<B2OResponse> {
		if (!this.connected) {
			throw new Error('REST+SSE transport not connected');
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

		try {
			const response = await fetch(`${this.config.baseUrl}/orchestrator/request`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text();
				return {
					id: request.id,
					error: {
						code: `HTTP_${response.status}`,
						message: errorText || response.statusText,
					},
				};
			}

			const data = await response.json() as any;
			return {
				id: request.id,
				result: data.result,
				error: data.error,
			};
		} catch (error: any) {
			clearTimeout(timeoutId);

			if (error.name === 'AbortError') {
				return {
					id: request.id,
					error: {
						code: 'TIMEOUT',
						message: `Request timeout after ${this.requestTimeout}ms`,
					},
				};
			}

			return {
				id: request.id,
				error: {
					code: 'NETWORK_ERROR',
					message: error.message || 'Network request failed',
				},
			};
		}
	}

	// ===========================================================================================
	// EVENT SUBSCRIPTION
	// ===========================================================================================

	subscribe(eventType: O2BEventType): void {
		this.subscribedEvents.add(eventType);

		if (this.connected) {
			// SSE subscription is handled via query params in the EventSource URL
			// Reconnect with updated subscription list
			this.reconnectSSE();
		}
	}

	unsubscribe(eventType: O2BEventType): void {
		this.subscribedEvents.delete(eventType);

		if (this.connected) {
			// Reconnect with updated subscription list
			this.reconnectSSE();
		}
	}

	onEvent(handler: TransportEventHandler): void {
		this.eventHandler = handler;
	}

	offEvent(): void {
		this.eventHandler = null;
	}

	// ===========================================================================================
	// SSE CONNECTION
	// ===========================================================================================

	private async connectSSE(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				// Build URL with subscribed event types as query params
				const url = new URL(`${this.config.baseUrl}/orchestrator/events`);

				if (this.subscribedEvents.size > 0) {
					url.searchParams.set('events', Array.from(this.subscribedEvents).join(','));
				}

				this.eventSource = new EventSource(url.toString());

				this.eventSource.onopen = () => {
					console.log('[RestSseTransport] SSE connection established');
					resolve();
				};

				this.eventSource.onmessage = (event: MessageEvent) => {
					this.handleSSEMessage(event.data);
				};

				this.eventSource.onerror = (error: Event) => {
					console.error('[RestSseTransport] SSE connection error:', error);

					if (!this.connected) {
						// Initial connection failed
						reject(new Error('Failed to establish SSE connection'));
					} else if (this.shouldReconnect) {
						// Connection lost, will auto-reconnect
						console.log(`[RestSseTransport] SSE reconnecting in ${this.sseReconnectDelay}ms`);
					}
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	private disconnectSSE(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

	private reconnectSSE(): void {
		this.disconnectSSE();

		setTimeout(() => {
			if (this.shouldReconnect && this.connected) {
				this.connectSSE().catch((error) => {
					console.error('[RestSseTransport] SSE reconnection failed:', error);
				});
			}
		}, this.sseReconnectDelay);
	}

	private handleSSEMessage(data: string): void {
		try {
			const event: O2BEvent = JSON.parse(data);

			if (this.eventHandler) {
				this.eventHandler(event);
			}
		} catch (error) {
			console.error('[RestSseTransport] Failed to parse SSE message:', error);
		}
	}
}
