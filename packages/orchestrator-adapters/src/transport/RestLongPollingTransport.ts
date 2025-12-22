/**
 * ===========================================================================================
 * REST + LONG-POLLING TRANSPORT FOR ORCHESTRATOR COMMUNICATION
 * ===========================================================================================
 *
 * Fallback transport using REST for requests and long-polling for events.
 * Implements the OrchestratorTransport interface.
 *
 * Features:
 * - HTTP POST requests for B→O requests
 * - Long-polling GET requests for O→B events
 * - Event batching (receives multiple events per poll)
 * - Automatic poll restart after receiving events
 * - Request timeout handling
 *
 * Endpoints:
 * - POST /orchestrator/request - Send B→O requests
 * - GET /orchestrator/poll?timeout=30&events=task.created,worker.status - Long-poll for events
 *
 * Protocol:
 * - Request: POST { method, params } → Response: { result } or { error }
 * - Poll: GET ?timeout=30 → Response: { events: [O2BEvent, ...] }
 *
 * ===========================================================================================
 */
import type { B2ORequest, B2OResponse, O2BEvent, O2BEventType } from '@app/shared-orch-backend';

import type { OrchestratorTransport, TransportEventHandler } from './OrchestratorTransport.js';

/**
 * REST + Long-polling transport configuration
 */
export interface RestLongPollingTransportConfig {
	/** Base URL of orchestrator server (e.g., 'http://localhost:3737') */
	baseUrl: string;
	/** Request timeout in milliseconds (default: 30000) */
	requestTimeout?: number;
	/** Long-poll timeout in seconds (default: 30) */
	pollTimeout?: number;
	/** Delay before restarting poll after error (default: 1000ms) */
	pollRetryDelay?: number;
}

/**
 * REST + Long-polling Transport Implementation
 *
 * Uses REST for requests and long-polling for event streaming.
 * Most compatible but highest latency transport.
 */
export class RestLongPollingTransport implements OrchestratorTransport {
	private connected = false;
	private polling = false;
	private eventHandler: TransportEventHandler | null = null;
	private subscribedEvents = new Set<string>();
	private shouldPoll = true;
	private pollAbortController: AbortController | null = null;

	private readonly requestTimeout: number;
	private readonly pollTimeout: number;
	private readonly pollRetryDelay: number;

	constructor(private config: RestLongPollingTransportConfig) {
		this.requestTimeout = config.requestTimeout ?? 30000;
		this.pollTimeout = config.pollTimeout ?? 30;
		this.pollRetryDelay = config.pollRetryDelay ?? 1000;
	}

	// ===========================================================================================
	// CONNECTION LIFECYCLE
	// ===========================================================================================

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		this.shouldPoll = true;
		this.connected = true;

		// Start polling for events
		this.startPolling();

		console.log(`[RestLongPollingTransport] Connected to ${this.config.baseUrl}`);
	}

	async disconnect(): Promise<void> {
		this.shouldPoll = false;
		this.stopPolling();
		this.connected = false;

		console.log('[RestLongPollingTransport] Disconnected');
	}

	isConnected(): boolean {
		return this.connected;
	}

	// ===========================================================================================
	// REQUEST/RESPONSE
	// ===========================================================================================

	async request(request: B2ORequest): Promise<B2OResponse> {
		if (!this.connected) {
			throw new Error('REST+LongPolling transport not connected');
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

			const data = (await response.json()) as any;
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

		// Restart polling with updated subscription list
		if (this.connected) {
			this.restartPolling();
		}
	}

	unsubscribe(eventType: O2BEventType): void {
		this.subscribedEvents.delete(eventType);

		// Restart polling with updated subscription list
		if (this.connected) {
			this.restartPolling();
		}
	}

	onEvent(handler: TransportEventHandler): void {
		this.eventHandler = handler;
	}

	offEvent(): void {
		this.eventHandler = null;
	}

	// ===========================================================================================
	// LONG-POLLING
	// ===========================================================================================

	private startPolling(): void {
		if (this.polling || !this.shouldPoll) {
			return;
		}

		this.polling = true;
		this.poll();
	}

	private stopPolling(): void {
		this.polling = false;

		if (this.pollAbortController) {
			this.pollAbortController.abort();
			this.pollAbortController = null;
		}
	}

	private restartPolling(): void {
		this.stopPolling();
		this.startPolling();
	}

	private async poll(): Promise<void> {
		while (this.polling && this.shouldPoll) {
			try {
				const events = await this.longPollRequest();

				// Deliver events
				if (events.length > 0 && this.eventHandler) {
					events.forEach(event => {
						try {
							this.eventHandler!(event);
						} catch (error) {
							console.error('[RestLongPollingTransport] Event handler error:', error);
						}
					});
				}
			} catch (error: any) {
				if (error.name !== 'AbortError') {
					console.error('[RestLongPollingTransport] Poll error:', error);
					// Wait before retrying
					await this.sleep(this.pollRetryDelay);
				}
			}
		}
	}

	private async longPollRequest(): Promise<O2BEvent[]> {
		// Build URL with timeout and subscribed events
		const url = new URL(`${this.config.baseUrl}/orchestrator/poll`);
		url.searchParams.set('timeout', this.pollTimeout.toString());

		if (this.subscribedEvents.size > 0) {
			url.searchParams.set('events', Array.from(this.subscribedEvents).join(','));
		}

		// Create abort controller for this poll
		this.pollAbortController = new AbortController();

		// Long-poll timeout should be pollTimeout + 5s buffer
		const pollTimeoutMs = (this.pollTimeout + 5) * 1000;
		const timeoutId = setTimeout(() => {
			if (this.pollAbortController) {
				this.pollAbortController.abort();
			}
		}, pollTimeoutMs);

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				signal: this.pollAbortController.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as any;
			return data.events || [];
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		} finally {
			this.pollAbortController = null;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
