/* global Response, Headers, Blob, FormData */
import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	CircuitBreakerServiceClass,
	CircuitState,
	type CircuitStateListener,
	TestTimeScheduler,
} from './CircuitBreakerService';

// Controllable Promise for deterministic async testing
interface ControllablePromise<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: any) => void;
}

function createControllablePromise<T>(): ControllablePromise<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('CircuitBreakerService', () => {
	let service: CircuitBreakerServiceClass;
	let scheduler: TestTimeScheduler;
	let mockFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
	let originalFetch: typeof globalThis.fetch;

	// Helper to wait for async operations to complete
	const waitForAsync = async (ticks = 5) => {
		// Wait multiple ticks to ensure all async operations complete
		for (let i = 0; i < ticks; i++) {
			// Add comment above the target line, not at the end
			// Wait a tick for async operations
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;
		}
	};

	// Helper to create a mock Response
	const createMockResponse = (ok: boolean, status: number): Response => {
		return {
			ok,
			status,
			statusText: ok ? 'OK' : 'Error',
			headers: new Headers(),
			redirected: false,
			type: 'basic',
			url: '',
			clone: () => createMockResponse(ok, status),
			body: null,
			bodyUsed: false,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
			blob: () => Promise.resolve(new Blob()),
			formData: () => Promise.resolve(new FormData()),
			json: () => Promise.resolve({}),
			text: () => Promise.resolve(''),
		} as Response;
	};

	beforeEach(() => {
		// Setup test scheduler
		scheduler = new TestTimeScheduler();
		service = new CircuitBreakerServiceClass({
			healthCheckEndpoint: 'http://test-api/health',
			scheduler,
		});

		// Mock fetch
		originalFetch = globalThis.fetch;
		mockFetch = vi.fn<typeof globalThis.fetch>();
		globalThis.fetch = mockFetch as typeof globalThis.fetch;
	});

	afterEach(() => {
		// Restore fetch
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe('State Transitions', () => {
		it('should start in CLOSED state', () => {
			expect(service.getState().state).toBe(CircuitState.CLOSED);
		});

		it('should transition to OPEN after threshold failures (server errors)', async () => {
			// Mock 3 consecutive server errors (5xx)
			// Server errors use threshold-based opening (3 failures)
			mockFetch
				.mockResolvedValueOnce(createMockResponse(false, 500))
				.mockResolvedValueOnce(createMockResponse(false, 503))
				.mockResolvedValueOnce(createMockResponse(false, 502));

			// Make 3 failed requests
			await service.executeFetch('/api/test', { method: 'GET' });
			expect(service.getState().state).toBe(CircuitState.CLOSED);

			await service.executeFetch('/api/test', { method: 'GET' });
			expect(service.getState().state).toBe(CircuitState.CLOSED);

			await service.executeFetch('/api/test', { method: 'GET' });
			expect(service.getState().state).toBe(CircuitState.OPEN);
		});

		it('should open circuit immediately on network error', async () => {
			// Network errors (connection refused, timeout) indicate backend is unreachable
			// Circuit should open immediately without waiting for threshold
			mockFetch.mockRejectedValue(new Error('Network error'));

			// First network error should open circuit and queue the request
			const promise = service.executeFetch('/api/test', { method: 'GET' });
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);
			expect(service.getState().queueSize).toBe(1);

			// Setup mock for queued request
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200)); // health check
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200)); // queued request

			// Advance time to trigger health check
			scheduler.advance(1000);
			await waitForAsync();
			await promise;
		});

		it('should transition to HALF_OPEN during health check', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Advance time to trigger health check
			mockFetch.mockResolvedValueOnce(createMockResponse(false, 503));
			scheduler.advance(1000); // 1s delay

			// Wait for async health check to execute
			// Add comment above the target line, not at the end
			// Wait a tick for async operations
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;

			// Should have transitioned to HALF_OPEN during check, then back to OPEN
			expect(service.getState().state).toBe(CircuitState.OPEN);
		});

		it('should transition to CLOSED after successful health check', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Mock successful health check
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));
			// Mock for queued request that will be flushed
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));

			// Advance time to trigger health check
			scheduler.advance(1000);
			await waitForAsync(5); // Wait for health check to complete (async callback + fetch + close)

			// Should have closed the circuit
			expect(service.getState().state).toBe(CircuitState.CLOSED);
		});

		it('should stay OPEN after failed health check', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Mock failed health check
			mockFetch.mockRejectedValueOnce(new Error('Still down'));

			// Advance time to trigger health check
			scheduler.advance(1000);
			// Add comment above the target line, not at the end
			// Wait a tick for async operations
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;

			// Should stay OPEN
			expect(service.getState().state).toBe(CircuitState.OPEN);
		});

		it('should reset failure count on successful request (server errors)', async () => {
			// Make 2 failed requests with server errors (5xx)
			// Server errors use threshold-based opening
			mockFetch
				.mockResolvedValueOnce(createMockResponse(false, 500))
				.mockResolvedValueOnce(createMockResponse(false, 503));
			await service.executeFetch('/api/test', { method: 'GET' });
			await service.executeFetch('/api/test', { method: 'GET' });

			// Make a successful request
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));
			await service.executeFetch('/api/test', { method: 'GET' });

			// Circuit should still be CLOSED
			expect(service.getState().state).toBe(CircuitState.CLOSED);

			// One more failure should not open circuit (counter was reset)
			mockFetch.mockResolvedValueOnce(createMockResponse(false, 500));
			await service.executeFetch('/api/test', { method: 'GET' });
			expect(service.getState().state).toBe(CircuitState.CLOSED);
		});

		it('should not open circuit for client errors (4xx)', async () => {
			// Mock client errors
			mockFetch
				.mockResolvedValueOnce(createMockResponse(false, 400))
				.mockResolvedValueOnce(createMockResponse(false, 404))
				.mockResolvedValueOnce(createMockResponse(false, 403));

			// Make 3 requests with client errors
			await service.executeFetch('/api/test', { method: 'GET' });
			await service.executeFetch('/api/test', { method: 'GET' });
			await service.executeFetch('/api/test', { method: 'GET' });

			// Circuit should stay CLOSED (client errors don't count as failures)
			expect(service.getState().state).toBe(CircuitState.CLOSED);
		});

		it('should open circuit for server errors (5xx)', async () => {
			// Mock server errors
			mockFetch
				.mockResolvedValueOnce(createMockResponse(false, 500))
				.mockResolvedValueOnce(createMockResponse(false, 503))
				.mockResolvedValueOnce(createMockResponse(false, 502));

			// Make 3 requests with server errors
			await service.executeFetch('/api/test', { method: 'GET' });
			await service.executeFetch('/api/test', { method: 'GET' });
			await service.executeFetch('/api/test', { method: 'GET' });

			// Circuit should be OPEN
			expect(service.getState().state).toBe(CircuitState.OPEN);
		});
	});

	describe('Exponential Backoff', () => {
		it('should start with initial delay (1s)', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute

			expect(service.getState().delay).toBe(1000); // 1s
		});

		it('should double delay after each failure', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute

			expect(service.getState().delay).toBe(1000);

			// First failed health check - use controllable promise
			const healthCheck1 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck1.promise);
			scheduler.advance(1000);
			await waitForAsync(2);
			healthCheck1.reject(new Error('Still down'));
			await waitForAsync(3); // Wait more ticks for promise rejection to be handled
			expect(service.getState().delay).toBe(2000);

			// Second failed health check
			const healthCheck2 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck2.promise);
			scheduler.advance(2000);
			await waitForAsync(2);
			healthCheck2.reject(new Error('Still down'));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(4000);

			// Third failed health check
			const healthCheck3 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck3.promise);
			scheduler.advance(4000);
			await waitForAsync(2);
			healthCheck3.reject(new Error('Still down'));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(8000);
		});

		it('should cap delay at maximum (30s)', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute

			// Simulate multiple failed health checks
			const maxIterations = 10;
			for (let i = 0; i < maxIterations; i++) {
				const currentDelay = service.getState().delay;
				mockFetch.mockRejectedValueOnce(new Error('Still down'));
				scheduler.advance(currentDelay);
				// Add comment above the target line, not at the end
				// Wait a tick for async operations
				const deferred = createDeferredPromise<void>();
				deferred.resolve();
				await deferred.promise;
			}

			// Delay should be capped at 30s
			expect(service.getState().delay).toBe(30000);
		});

		it('should reset delay after successful recovery', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued, don't await
			await waitForAsync(); // Let async error handling execute

			// Increase delay with failed health check
			const healthCheck1 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck1.promise);
			scheduler.advance(1000);
			await waitForAsync(2);
			healthCheck1.reject(new Error('Still down'));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(2000);

			// Successful recovery
			const healthCheck2 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck2.promise);
			scheduler.advance(2000);
			await waitForAsync(2);
			healthCheck2.resolve(createMockResponse(true, 200));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(1000);
		});
	});

	describe('Request Queueing', () => {
		it('should queue requests when circuit is OPEN', async () => {
			// Open the circuit with network error (opens immediately and queues the request)
			mockFetch.mockRejectedValue(new Error('Network error'));
			const initialPromise = service.executeFetch('/api/test', { method: 'GET' });
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);
			expect(service.getState().queueSize).toBe(1);

			// Queue another request (will be pending)
			const promise = service.executeFetch('/api/books', { method: 'GET' });

			// Should have 2 requests queued (test and books endpoints)
			expect(service.getState().queueSize).toBe(2);

			// Setup mocks for queued requests BEFORE health check succeeds
			// (because flushQueue is called synchronously when circuit closes)
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200)); // test request
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200)); // books request

			// Close circuit with successful health check
			const healthCheck = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck.promise);
			scheduler.advance(1000);
			await waitForAsync(1);
			healthCheck.resolve(createMockResponse(true, 200));
			await waitForAsync(1);

			// Wait for queued requests to complete
			await initialPromise;
			const response = await promise;

			// Queue should be empty
			expect(service.getState().queueSize).toBe(0);
			expect(response.ok).toBe(true);
		});

		it('should deduplicate requests by full endpoint (pathname + query)', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Queue multiple requests to SAME full endpoint (same query params)
			const promise1 = service.executeFetch('/api/books?page=1', { method: 'GET' });
			const promise2 = service.executeFetch('/api/books?page=1', { method: 'GET' });
			const promise3 = service.executeFetch('/api/books?page=1', { method: 'GET' });

			// Should have 2 endpoints queued (test and books?page=1), deduplicated by pathname+query
			expect(service.getState().queueSize).toBe(2);

			// All three should resolve with the same response when circuit closes
			mockFetch
				.mockResolvedValueOnce(createMockResponse(true, 200)) // health check
				.mockResolvedValueOnce(createMockResponse(true, 200)) // test request
				.mockResolvedValueOnce(createMockResponse(true, 200)); // books request
			scheduler.advance(1000);
			await waitForAsync();

			// All promises should resolve with the same response
			const response1 = await promise1;
			const response2 = await promise2;
			const response3 = await promise3;
			expect(response1.ok).toBe(true);
			expect(response2.ok).toBe(true);
			expect(response3.ok).toBe(true);
		});

		it('should handle multiple promises per endpoint', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Queue requests to different endpoints
			const booksPromise1 = service.executeFetch('/api/books', { method: 'GET' });
			const booksPromise2 = service.executeFetch('/api/books', { method: 'POST' });
			const ingredientsPromise = service.executeFetch('/api/ingredients', { method: 'GET' });

			// Should have 3 endpoints queued (test, books, and ingredients)
			expect(service.getState().queueSize).toBe(3);

			// Close circuit and flush queue
			mockFetch
				.mockResolvedValueOnce(createMockResponse(true, 200)) // health check
				.mockResolvedValueOnce(createMockResponse(true, 200)) // test request
				.mockResolvedValueOnce(createMockResponse(true, 200)) // books request
				.mockResolvedValueOnce(createMockResponse(true, 200)); // ingredients request
			scheduler.advance(1000);
			await waitForAsync(5);

			// Both books promises should resolve with the same response
			const response1 = await booksPromise1;
			const response2 = await booksPromise2;
			const response3 = await ingredientsPromise;
			expect(response1.ok).toBe(true);
			expect(response2.ok).toBe(true);
			expect(response3.ok).toBe(true);
		});

		it('should flush queue after circuit closes', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Queue requests
			const booksPromise = service.executeFetch('/api/books', { method: 'GET' });
			const ingredientsPromise = service.executeFetch('/api/ingredients', { method: 'GET' });

			expect(service.getState().queueSize).toBe(3);

			// Close circuit with successful health check
			mockFetch
				.mockResolvedValueOnce(createMockResponse(true, 200)) // health check
				.mockResolvedValueOnce(createMockResponse(true, 200)) // test request
				.mockResolvedValueOnce(createMockResponse(true, 200)) // books request
				.mockResolvedValueOnce(createMockResponse(true, 200)); // ingredients request

			scheduler.advance(1000);
			await waitForAsync(5); // Wait for health check and queue flush

			// Queue should be empty
			expect(service.getState().queueSize).toBe(0);

			// Requests should resolve
			await expect(booksPromise).resolves.toBeDefined();
			await expect(ingredientsPromise).resolves.toBeDefined();
		});
	});

	describe('Health Checks', () => {
		it('should check /api/health endpoint', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Mock health check
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));

			// Advance time to trigger health check
			scheduler.advance(1000);
			// Add comment above the target line, not at the end
			// Wait a tick for async operations
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;

			// Should have called /api/health
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/health'),
				expect.objectContaining({
					method: 'GET',
				})
			);
		});

		it('should schedule next check with backoff delay', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// First health check fails
			const healthCheck1 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck1.promise);
			scheduler.advance(1000); // 1s
			await waitForAsync(2);
			healthCheck1.reject(new Error('Still down'));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(2000);

			// Second health check should be scheduled at current time + 2000ms
			const healthCheck2 = createControllablePromise<Response>();
			mockFetch.mockReturnValueOnce(healthCheck2.promise);
			scheduler.advance(2000); // advance by 2s
			await waitForAsync(2);
			healthCheck2.reject(new Error('Still down'));
			await waitForAsync(3);
			expect(service.getState().delay).toBe(4000);

			// Verify health checks were called
			const healthCheckCalls = mockFetch.mock.calls.filter(
				call => typeof call[0] === 'string' && call[0].includes('/health')
			);
			expect(healthCheckCalls.length).toBeGreaterThanOrEqual(2);
		});

		it('should stop checking after recovery', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Successful health check
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));
			// Mock for queued request that will be flushed
			mockFetch.mockResolvedValueOnce(createMockResponse(true, 200));

			scheduler.advance(1000);
			await waitForAsync(5); // Wait for health check to complete (async callback + fetch + close)

			// Circuit should be closed
			expect(service.getState().state).toBe(CircuitState.CLOSED);

			// Advance time - no more health checks should be scheduled
			const callCountBefore = mockFetch.mock.calls.length;
			scheduler.advance(10000);
			// Add comment above the target line, not at the end
			// Wait a tick for async operations
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;
			expect(mockFetch.mock.calls.length).toBe(callCountBefore);
		});
	});

	describe('Listeners', () => {
		it('should notify listeners on state change', async () => {
			const listener = vi.fn<CircuitStateListener>();
			service.subscribe(listener);

			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Should have notified listener
			expect(listener).toHaveBeenCalledWith(CircuitState.OPEN, 1000);
		});

		it('should unsubscribe listeners', async () => {
			const listener = vi.fn<CircuitStateListener>();
			const unsubscribe = service.subscribe(listener);

			// Unsubscribe
			unsubscribe();

			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Should not have notified listener
			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('Reset', () => {
		it('should reset circuit to initial state', async () => {
			// Open the circuit with network error (opens immediately)
			mockFetch.mockRejectedValue(new Error('Network error'));
			service.executeFetch('/api/test', { method: 'GET' }); // queued
			await waitForAsync(); // Let async error handling execute

			// Queue some requests
			service.executeFetch('/api/books', { method: 'GET' });
			service.executeFetch('/api/ingredients', { method: 'GET' });

			expect(service.getState().state).toBe(CircuitState.OPEN);
			expect(service.getState().queueSize).toBe(3);

			// Reset
			service.reset();

			// Should be back to initial state
			expect(service.getState().state).toBe(CircuitState.CLOSED);
			expect(service.getState().delay).toBe(1000);
			expect(service.getState().queueSize).toBe(0);
		});
	});
});
