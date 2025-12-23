/* global Response, RequestInit, AbortController */
/**
 * Circuit Breaker Service with Exponential Backoff
 *
 * Implements a circuit breaker pattern to prevent overwhelming the backend
 * when it's unreachable. Features:
 * - Automatic failure detection (3 consecutive failures)
 * - Exponential backoff (1s → 2s → 4s → ... → 30s max)
 * - Request queueing with deduplication by endpoint
 * - Automatic health checks and recovery
 * - Timeline-based time control for deterministic testing
 */

export enum CircuitState {
	CLOSED = 'CLOSED', // Normal operation
	OPEN = 'OPEN', // Backend unreachable, queueing requests
	HALF_OPEN = 'HALF_OPEN', // Testing recovery with health check
}

/**
 * Time scheduler interface for controlling time in tests
 */
export interface TimeScheduler {
	schedule(callback: () => void, delay: number): number;
	cancel(timerId: number): void;
	now(): number;
}

/**
 * Real-time scheduler for production (uses setTimeout)
 */
export class RealTimeScheduler implements TimeScheduler {
	schedule(callback: () => void, delay: number): number {
		return window.setTimeout(callback, delay) as unknown as number;
	}

	cancel(timerId: number): void {
		window.clearTimeout(timerId);
	}

	now(): number {
		return Date.now();
	}
}

/**
 * Test scheduler with controllable timeline for deterministic tests
 */
export class TestTimeScheduler implements TimeScheduler {
	private currentTime = 0;
	private scheduledCallbacks: Array<{ time: number; callback: () => void; id: number }> = [];
	private nextId = 1;

	schedule(callback: () => void, delay: number): number {
		const id = this.nextId++;
		this.scheduledCallbacks.push({
			time: this.currentTime + delay,
			callback,
			id,
		});
		// Sort by time to maintain execution order
		this.scheduledCallbacks.sort((a, b) => a.time - b.time);
		return id;
	}

	cancel(timerId: number): void {
		this.scheduledCallbacks = this.scheduledCallbacks.filter(item => item.id !== timerId);
	}

	now(): number {
		return this.currentTime;
	}

	/**
	 * Advance time by given milliseconds and execute all callbacks due
	 */
	advance(ms: number): void {
		const targetTime = this.currentTime + ms;

		while (this.scheduledCallbacks.length > 0 && this.scheduledCallbacks[0]!.time <= targetTime) {
			const item = this.scheduledCallbacks.shift()!;
			this.currentTime = item.time;
			item.callback();
		}

		this.currentTime = targetTime;
	}

	/**
	 * Execute all pending callbacks immediately
	 */
	flush(): void {
		while (this.scheduledCallbacks.length > 0) {
			const item = this.scheduledCallbacks.shift()!;
			this.currentTime = item.time;
			item.callback();
		}
	}

	/**
	 * Reset scheduler state
	 */
	reset(): void {
		this.currentTime = 0;
		this.scheduledCallbacks = [];
		this.nextId = 1;
	}
}

/**
 * Queued request waiting for circuit to close
 */
interface QueuedRequest {
	endpoint: string;
	promises: Array<{
		resolve: (value: Response) => void;
		reject: (error: Error) => void;
	}>;
	fetchOptions: {
		url: string;
		init: RequestInit;
	};
}

/**
 * Circuit breaker state listener
 */
export type CircuitStateListener = (state: CircuitState, delay: number) => void;

/**
 * Configuration options for CircuitBreakerService
 */
export interface CircuitBreakerConfig {
	/**
	 * Health check endpoint URL (e.g., "http://localhost:3000/api/health")
	 * This endpoint will be polled to detect when the backend is available again.
	 */
	healthCheckEndpoint: string;

	/**
	 * Initial delay in milliseconds (default: 1000ms = 1s)
	 */
	initialDelay?: number;

	/**
	 * Maximum delay in milliseconds (default: 30000ms = 30s)
	 */
	maxDelay?: number;

	/**
	 * Backoff multiplier factor (default: 2)
	 */
	backoffFactor?: number;

	/**
	 * Number of consecutive failures before opening circuit (default: 3)
	 */
	failureThreshold?: number;

	/**
	 * Health check request timeout in milliseconds (default: 5000ms = 5s)
	 */
	healthCheckTimeout?: number;

	/**
	 * Time scheduler for controlling time (mainly for testing)
	 */
	scheduler?: TimeScheduler;
}

/**
 * Circuit Breaker Service
 *
 * Framework-generic service that wraps fetch calls with circuit breaker logic.
 * Automatically detects backend failures and implements exponential backoff.
 *
 * Features:
 * - Configurable via dependency injection (no hard-coded API URLs)
 * - Automatic failure detection
 * - Exponential backoff
 * - Request queueing with deduplication
 * - Automatic health checks and recovery
 * - Testable with injectable time scheduler
 */
export class CircuitBreakerServiceClass {
	// State management
	private state: CircuitState = CircuitState.CLOSED;
	private failureCount: number = 0;
	private lastFailureTime: number | null = null;
	private currentDelay: number;
	private nextRetryTime: number | null = null; // Timestamp of next retry attempt

	// Configuration
	private readonly INITIAL_DELAY: number;
	private readonly MAX_DELAY: number;
	private readonly BACKOFF_FACTOR: number;
	private readonly FAILURE_THRESHOLD: number;
	private readonly HEALTH_CHECK_ENDPOINT: string;
	private readonly HEALTH_CHECK_TIMEOUT: number;

	// Request queue (deduplication by endpoint)
	private requestQueue: Map<string, QueuedRequest> = new Map();

	// State listeners (for React Context)
	private listeners: Set<CircuitStateListener> = new Set();

	// Health check timer
	private healthCheckTimerId: number | null = null;

	// Time scheduler (injectable for testing)
	private scheduler: TimeScheduler;

	/**
	 * Create a new CircuitBreakerService instance
	 *
	 * @param config Configuration options including health check endpoint
	 *
	 * @example
	 * ```ts
	 * // In your app initialization:
	 * import { getApiBaseUrl } from './utils/apiConfig';
	 *
	 * const circuitBreaker = new CircuitBreakerServiceClass({
	 *   healthCheckEndpoint: `${getApiBaseUrl()}/health`
	 * });
	 * ```
	 */
	constructor(config: CircuitBreakerConfig) {
		// Required configuration
		this.HEALTH_CHECK_ENDPOINT = config.healthCheckEndpoint;

		// Optional configuration with defaults
		this.INITIAL_DELAY = config.initialDelay ?? 1000;
		this.MAX_DELAY = config.maxDelay ?? 30000;
		this.BACKOFF_FACTOR = config.backoffFactor ?? 2;
		this.FAILURE_THRESHOLD = config.failureThreshold ?? 3;
		this.HEALTH_CHECK_TIMEOUT = config.healthCheckTimeout ?? 5000;
		this.scheduler = config.scheduler ?? new RealTimeScheduler();

		// Initialize state
		this.currentDelay = this.INITIAL_DELAY;
	}

	/**
	 * Execute a fetch request through the circuit breaker
	 */
	async executeFetch(url: string, init: RequestInit): Promise<Response> {
		// If circuit is OPEN, queue the request
		if (this.state === CircuitState.OPEN) {
			return this.queueRequest(url, init);
		}

		try {
			const response = await fetch(url, init);

			// Success: reset failure count
			if (response.ok || response.status < 500) {
				this.onSuccess();
				return response;
			}

			// Server error: count as failure
			this.onFailure();
			return response;
		} catch {
			// Network error (connection refused, timeout, etc.)
			// These indicate the backend is definitely unreachable
			// Open circuit immediately and queue the request
			this.onNetworkError();
			return this.queueRequest(url, init);
		}
	}

	/**
	 * Queue request when circuit is OPEN (deduplicate by endpoint)
	 * All promises for the same endpoint will receive the same response
	 */
	private queueRequest(url: string, init: RequestInit): Promise<Response> {
		const endpoint = this.extractEndpoint(url);

		// Create new promise
		const promise = new Promise<Response>((resolve, reject) => {
			const existing = this.requestQueue.get(endpoint);
			if (existing) {
				// Add this promise to existing queue for this endpoint
				// All will receive the same response (keep only last request's options)
				existing.promises.push({ resolve, reject });
				existing.fetchOptions = { url, init }; // Update to latest request
			} else {
				// Create new queue entry
				this.requestQueue.set(endpoint, {
					endpoint,
					promises: [{ resolve, reject }],
					fetchOptions: { url, init },
				});
			}
		});

		return promise;
	}

	/**
	 * Extract endpoint from full URL for deduplication
	 * Includes pathname + search params to differentiate pagination/filtering/sorting
	 */
	private extractEndpoint(url: string): string {
		try {
			const urlObj = new URL(url, window.location.origin);
			// Include both pathname and search params for uniqueness
			// e.g., "/api/books?page=1&sortBy=title"
			return urlObj.pathname + urlObj.search;
		} catch {
			return url; // Fallback to full URL if parsing fails
		}
	}

	/**
	 * Handle successful request
	 */
	private onSuccess(): void {
		if (this.state === CircuitState.HALF_OPEN) {
			// Recovery successful: close circuit
			this.closeCircuit();
		}
		this.failureCount = 0;
	}

	/**
	 * Handle failed request
	 */
	private onFailure(): void {
		this.failureCount++;
		this.lastFailureTime = this.scheduler.now();

		if (this.failureCount >= this.FAILURE_THRESHOLD) {
			this.openCircuit();
		}
	}

	/**
	 * Handle network error (connection refused, timeout, etc.)
	 * Network errors indicate the backend is definitely unreachable,
	 * so we open the circuit immediately without waiting for threshold
	 */
	private onNetworkError(): void {
		this.failureCount = this.FAILURE_THRESHOLD; // Force threshold
		this.lastFailureTime = this.scheduler.now();
		this.openCircuit();
	}

	/**
	 * Open circuit (backend unreachable)
	 */
	private openCircuit(): void {
		this.state = CircuitState.OPEN;
		this.currentDelay = this.INITIAL_DELAY;
		this.nextRetryTime = this.scheduler.now() + this.currentDelay;
		this.notifyListeners();

		// Start health check cycle
		this.startHealthCheck();
	}

	/**
	 * Close circuit (backend recovered)
	 */
	private closeCircuit(): void {
		this.state = CircuitState.CLOSED;
		this.failureCount = 0;
		this.currentDelay = this.INITIAL_DELAY;
		this.nextRetryTime = null;
		this.stopHealthCheck();
		this.notifyListeners();

		// Flush queued requests
		this.flushQueue();
	}

	/**
	 * Start health check cycle with exponential backoff
	 */
	private startHealthCheck(): void {
		this.stopHealthCheck(); // Clear any existing timer
		this.performHealthCheck();
	}

	/**
	 * Perform a single health check
	 */
	private performHealthCheck(delayMs?: number): void {
		const delay = delayMs ?? this.currentDelay;
		// Schedule the check after current delay
		this.healthCheckTimerId = this.scheduler.schedule(async () => {
			// Transition to HALF_OPEN for testing
			this.state = CircuitState.HALF_OPEN;
			// Keep nextRetryTime for UI countdown during health check
			// This way the user sees a continuous countdown instead of it jumping
			this.notifyListeners();

			try {
				const controller = new AbortController();
				const timeoutId = this.scheduler.schedule(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

				// Add cache-busting timestamp to prevent browser caching
				const url = `${this.HEALTH_CHECK_ENDPOINT}?_t=${Date.now()}`;
				const response = await fetch(url, {
					method: 'GET',
					signal: controller.signal,
					cache: 'no-cache',
				});

				this.scheduler.cancel(timeoutId);

				if (response.ok) {
					// Backend recovered
					this.closeCircuit();
				} else {
					// Still down: increase delay and schedule next check
					this.increaseDelay();
					this.state = CircuitState.OPEN;
					this.nextRetryTime = this.scheduler.now() + this.currentDelay;
					this.notifyListeners();
					this.scheduleNextHealthCheck();
				}
			} catch {
				// Still down: increase delay and schedule next check
				this.increaseDelay();
				this.state = CircuitState.OPEN;
				this.nextRetryTime = this.scheduler.now() + this.currentDelay;
				this.notifyListeners();
				this.scheduleNextHealthCheck();
			}
		}, delay);
	}

	/**
	 * Schedule next health check
	 */
	private scheduleNextHealthCheck(): void {
		this.performHealthCheck();
	}

	/**
	 * Stop health check cycle
	 */
	private stopHealthCheck(): void {
		if (this.healthCheckTimerId !== null) {
			this.scheduler.cancel(this.healthCheckTimerId);
			this.healthCheckTimerId = null;
		}
	}

	/**
	 * Increase delay using exponential backoff
	 */
	private increaseDelay(): void {
		this.currentDelay = Math.min(this.currentDelay * this.BACKOFF_FACTOR, this.MAX_DELAY);
	}

	/**
	 * Flush queued requests by executing them
	 * All promises for the same endpoint receive the same response (cloned)
	 */
	private flushQueue(): void {
		const requests = Array.from(this.requestQueue.values());
		this.requestQueue.clear();

		requests.forEach(({ promises, fetchOptions }) => {
			this.executeFetch(fetchOptions.url, fetchOptions.init)
				.then(response => {
					// Clone response for each promise (except the last one)
					// Response body can only be read once, so we need to clone
					promises.forEach((p, index) => {
						const responseToSend = index < promises.length - 1 ? response.clone() : response;
						p.resolve(responseToSend);
					});
				})
				.catch(error => {
					// Reject all promises for this endpoint with the same error
					promises.forEach(p => p.reject(error));
				});
		});
	}

	/**
	 * Subscribe to state changes (for React Context)
	 */
	subscribe(listener: CircuitStateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Notify all listeners of state change
	 */
	private notifyListeners(): void {
		this.listeners.forEach(listener => {
			listener(this.state, this.currentDelay);
		});
	}

	/**
	 * Get current state (for debugging/monitoring)
	 */
	getState(): {
		state: CircuitState;
		delay: number;
		queueSize: number;
		nextRetryTime: number | null;
	} {
		return {
			state: this.state,
			delay: this.currentDelay,
			queueSize: this.requestQueue.size,
			nextRetryTime: this.nextRetryTime,
		};
	}

	/**
	 * Manual reset (for testing/admin)
	 */
	reset(): void {
		this.stopHealthCheck();
		this.state = CircuitState.CLOSED;
		this.failureCount = 0;
		this.currentDelay = this.INITIAL_DELAY;
		this.lastFailureTime = null;
		this.nextRetryTime = null;
		this.requestQueue.clear();
		this.notifyListeners();
	}

	/**
	 * Force retry now (for manual user action)
	 * Triggers immediate health check if circuit is OPEN
	 */
	forceRetry(): void {
		if (this.state === CircuitState.OPEN) {
			this.stopHealthCheck();
			// Perform health check immediately (0ms delay)
			this.performHealthCheck(0);
		}
	}
}

/**
 * Factory function to create a CircuitBreakerService instance
 *
 * @param config Configuration options including health check endpoint
 * @returns CircuitBreakerService instance
 *
 * @example
 * ```ts
 * import { createCircuitBreaker } from '@framework/features/connectivity';
 * import { getApiBaseUrl } from './utils/apiConfig';
 *
 * export const circuitBreakerService = createCircuitBreaker({
 *   healthCheckEndpoint: `${getApiBaseUrl()}/health`
 * });
 * ```
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreakerServiceClass {
	return new CircuitBreakerServiceClass(config);
}
