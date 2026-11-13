import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitBreakerServiceClass, CircuitState, RealTimeScheduler } from './CircuitBreakerService';

/**
 * Regression: in CI, a health check timer fired after the jsdom environment was torn down and
 * RealTimeScheduler.schedule threw "window is not defined" (unhandled error, vitest exit code 1).
 * Teardown is simulated by removing `window`.
 */
describe('RealTimeScheduler after DOM teardown', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('schedules and fires callbacks when window is gone', () => {
		const scheduler = new RealTimeScheduler();
		const callback = vi.fn();
		vi.stubGlobal('window', undefined);

		expect(() => scheduler.schedule(callback, 1000)).not.toThrow();
		vi.advanceTimersByTime(1000);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('cancels a scheduled callback when window is gone', () => {
		const scheduler = new RealTimeScheduler();
		const callback = vi.fn();
		const timerId = scheduler.schedule(callback, 1000);
		vi.stubGlobal('window', undefined);

		expect(() => scheduler.cancel(timerId)).not.toThrow();
		vi.advanceTimersByTime(5000);

		expect(callback).not.toHaveBeenCalled();
	});

	it('keeps the health check loop alive without throwing when a timer fires after teardown', async () => {
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		try {
			const failingFetch = vi.fn().mockRejectedValue(new Error('backend unreachable'));
			vi.stubGlobal('fetch', failingFetch);
			const service = new CircuitBreakerServiceClass({ healthCheckEndpoint: 'http://localhost/api/health' });

			// Network error opens the circuit and arms the first health check (default RealTimeScheduler)
			void service.executeFetch('http://localhost/api/books', {});
			await vi.advanceTimersByTimeAsync(0);
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Teardown, then the health check timer fires and re-arms itself
			vi.stubGlobal('window', undefined);
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			// First call is the original request, the next ones are health checks
			expect(failingFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
			expect(unhandled).not.toHaveBeenCalled();
			expect(service.getState().state).toBe(CircuitState.OPEN);

			// Stop the loop so no timer outlives the test
			service.reset();
		} finally {
			process.off('unhandledRejection', unhandled);
		}
	});
});
