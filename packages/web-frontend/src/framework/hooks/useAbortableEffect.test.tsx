/* global AbortSignal */
import { useState } from 'react';

import { createControllablePromise } from '@framework/tests/createControllablePromise';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAbortableEffect } from './useAbortableEffect';

/**
 * ===========================================================================================
 * USE ABORTABLE EFFECT TESTS - Race Condition Protection
 * ===========================================================================================
 *
 * These tests verify that useAbortableEffect correctly prevents race conditions by:
 * - Cancelling stale requests when dependencies change
 * - Only applying results from the most recent request
 * - Providing accurate abort signals
 *
 * Uses createControllablePromise for deterministic, non-flaky tests.
 * ===========================================================================================
 */

describe('useAbortableEffect', () => {
	describe('Basic Functionality', () => {
		it('should execute effect on mount', async () => {
			const effect = vi.fn(async () => {});

			renderHook(() => useAbortableEffect(effect, []));

			await waitFor(() => {
				expect(effect).toHaveBeenCalledTimes(1);
			});
		});

		it('should provide AbortSignal to effect', async () => {
			let receivedSignal: AbortSignal | null = null;

			const effect = vi.fn(async (signal: AbortSignal) => {
				receivedSignal = signal;
			});

			renderHook(() => useAbortableEffect(effect, []));

			await waitFor(() => {
				expect(receivedSignal).toBeInstanceOf(AbortSignal);
				expect(receivedSignal?.aborted).toBe(false);
			});
		});

		it('should execute effect when dependencies change', async () => {
			const effect = vi.fn(async () => {});
			const { rerender } = renderHook(({ dep }) => useAbortableEffect(effect, [dep]), {
				initialProps: { dep: 1 },
			});

			await waitFor(() => {
				expect(effect).toHaveBeenCalledTimes(1);
			});

			rerender({ dep: 2 });

			await waitFor(() => {
				expect(effect).toHaveBeenCalledTimes(2);
			});
		});

		it('should not execute effect when dependencies remain unchanged', async () => {
			const effect = vi.fn(async () => {});
			const { rerender } = renderHook(({ dep }) => useAbortableEffect(effect, [dep]), {
				initialProps: { dep: 1 },
			});

			await waitFor(() => {
				expect(effect).toHaveBeenCalledTimes(1);
			});

			rerender({ dep: 1 });

			await waitFor(() => {
				expect(effect).toHaveBeenCalledTimes(1); // Still 1, not 2
			});
		});
	});

	describe('Race Condition Protection', () => {
		it('should cancel previous effect when dependencies change', async () => {
			const promise1 = createControllablePromise<[AbortSignal], void>();
			const promise2 = createControllablePromise<[AbortSignal], void>();

			const signals: AbortSignal[] = [];

			const { rerender } = renderHook(
				({ dep }) => {
					useAbortableEffect(
						async signal => {
							signals.push(signal);
							if (dep === 1) {
								await promise1.fn(signal);
							} else {
								await promise2.fn(signal);
							}
						},
						[dep]
					);
				},
				{ initialProps: { dep: 1 } }
			);

			// Wait for first effect to start
			await waitFor(() => {
				expect(promise1.wasCalled()).toBe(true);
			});

			const signal1 = signals[0];
			expect(signal1?.aborted).toBe(false);

			// Change dependency - should cancel first effect
			rerender({ dep: 2 });

			// Wait for second effect to start
			await waitFor(() => {
				expect(promise2.wasCalled()).toBe(true);
			});

			// First signal should now be aborted
			expect(signal1?.aborted).toBe(true);

			// Second signal should not be aborted
			const signal2 = signals[1];
			expect(signal2?.aborted).toBe(false);
		});

		it('should ignore results from cancelled slow request that finishes after fast request', async () => {
			const slowRequest = createControllablePromise<[AbortSignal], void>();
			const fastRequest = createControllablePromise<[AbortSignal], void>();

			const results: string[] = [];

			const { rerender } = renderHook(
				({ dep }) => {
					useAbortableEffect(
						async signal => {
							if (dep === 1) {
								// Slow request
								await slowRequest.fn(signal);
								if (!signal.aborted) {
									results.push('slow');
								}
							} else {
								// Fast request
								await fastRequest.fn(signal);
								if (!signal.aborted) {
									results.push('fast');
								}
							}
						},
						[dep]
					);
				},
				{ initialProps: { dep: 1 } }
			);

			// Wait for slow request to start
			await waitFor(() => {
				expect(slowRequest.wasCalled()).toBe(true);
			});

			// Change dependency - start fast request
			rerender({ dep: 2 });

			// Wait for fast request to start
			await waitFor(() => {
				expect(fastRequest.wasCalled()).toBe(true);
			});

			// Complete fast request first
			fastRequest.resolve();

			await waitFor(() => {
				expect(results).toEqual(['fast']);
			});

			// Complete slow request after fast request
			slowRequest.resolve();

			// Wait a bit to ensure slow request had time to process
			await new Promise(resolve => setTimeout(resolve, 50));

			// Slow request result should be ignored
			expect(results).toEqual(['fast']); // Still just 'fast', not ['fast', 'slow']
		});

		it('should handle multiple rapid dependency changes', async () => {
			const promises = [
				createControllablePromise<[AbortSignal], void>(),
				createControllablePromise<[AbortSignal], void>(),
				createControllablePromise<[AbortSignal], void>(),
			];

			const results: number[] = [];

			const { rerender } = renderHook(
				({ dep }) => {
					useAbortableEffect(
						async signal => {
							const promiseIndex = dep - 1;
							await promises[promiseIndex]!.fn(signal);
							if (!signal.aborted) {
								results.push(dep);
							}
						},
						[dep]
					);
				},
				{ initialProps: { dep: 1 } }
			);

			// Trigger 3 effects rapidly
			await waitFor(() => expect(promises[0]!.wasCalled()).toBe(true));
			rerender({ dep: 2 });
			await waitFor(() => expect(promises[1]!.wasCalled()).toBe(true));
			rerender({ dep: 3 });
			await waitFor(() => expect(promises[2]!.wasCalled()).toBe(true));

			// Only complete the last one
			promises[2]!.resolve();

			await waitFor(() => {
				expect(results).toEqual([3]); // Only last request result
			});

			// Complete the first two (should be ignored)
			promises[0]!.resolve();
			promises[1]!.resolve();

			await new Promise(resolve => setTimeout(resolve, 50));

			// Still only the last result
			expect(results).toEqual([3]);
		});
	});

	describe('State Updates with Race Protection', () => {
		it('should only apply state updates from non-aborted requests', async () => {
			const request1 = createControllablePromise<[AbortSignal], string>();
			const request2 = createControllablePromise<[AbortSignal], string>();

			const { result, rerender } = renderHook(
				({ query }) => {
					const [data, setData] = useState<string>('');

					useAbortableEffect(
						async signal => {
							let promiseResult: string;
							if (query === 'first') {
								promiseResult = await request1.fn(signal);
							} else {
								promiseResult = await request2.fn(signal);
							}

							if (!signal.aborted) {
								setData(promiseResult);
							}
						},
						[query]
					);

					return data;
				},
				{ initialProps: { query: 'first' } }
			);

			// Start first request
			await waitFor(() => expect(request1.wasCalled()).toBe(true));

			// Change query - start second request
			rerender({ query: 'second' });
			await waitFor(() => expect(request2.wasCalled()).toBe(true));

			// Complete second request first (fast)
			request2.resolve('result-2');

			await waitFor(() => {
				expect(result.current).toBe('result-2');
			});

			// Complete first request (slow) - should be ignored
			request1.resolve('result-1');

			await new Promise(resolve => setTimeout(resolve, 50));

			// State should still be from second request
			expect(result.current).toBe('result-2');
		});
	});

	describe('Error Handling', () => {
		it('should allow effect to handle errors', async () => {
			const promise = createControllablePromise<[AbortSignal], void>();
			const errors: Error[] = [];

			renderHook(() => {
				useAbortableEffect(async signal => {
					try {
						await promise.fn(signal);
					} catch (error) {
						if (!signal.aborted) {
							errors.push(error as Error);
						}
					}
				}, []);
			});

			await waitFor(() => {
				expect(promise.wasCalled()).toBe(true);
			});

			const testError = new Error('Test error');
			promise.reject(testError);

			await waitFor(() => {
				expect(errors).toEqual([testError]);
			});
		});

		it('should not report errors for aborted requests', async () => {
			const promise1 = createControllablePromise<[AbortSignal], void>();
			const promise2 = createControllablePromise<[AbortSignal], void>();
			const errors: Error[] = [];

			const { rerender } = renderHook(
				({ dep }) => {
					useAbortableEffect(
						async signal => {
							try {
								if (dep === 1) {
									await promise1.fn(signal);
								} else {
									await promise2.fn(signal);
								}
							} catch (error) {
								if (!signal.aborted) {
									errors.push(error as Error);
								}
							}
						},
						[dep]
					);
				},
				{ initialProps: { dep: 1 } }
			);

			await waitFor(() => expect(promise1.wasCalled()).toBe(true));

			// Change dependency - abort first request
			rerender({ dep: 2 });

			await waitFor(() => expect(promise2.wasCalled()).toBe(true));

			// Reject the aborted request
			const error1 = new Error('Aborted request error');
			promise1.reject(error1);

			await new Promise(resolve => setTimeout(resolve, 50));

			// Error from aborted request should not be tracked
			expect(errors).toEqual([]);

			// Reject the non-aborted request
			const error2 = new Error('Active request error');
			promise2.reject(error2);

			await waitFor(() => {
				expect(errors).toEqual([error2]); // Only non-aborted error
			});
		});
	});

	describe('Cleanup Behavior', () => {
		it('should abort effect when component unmounts', async () => {
			const promise = createControllablePromise<[AbortSignal], void>();
			let signal: AbortSignal | null = null;

			const { unmount } = renderHook(() => {
				useAbortableEffect(async sig => {
					signal = sig;
					await promise.fn(sig);
				}, []);
			});

			await waitFor(() => {
				expect(promise.wasCalled()).toBe(true);
				expect(signal!.aborted).toBe(false);
			});

			// Unmount component
			unmount();

			// Signal should be aborted
			expect(signal!.aborted).toBe(true);
		});
	});

	describe('Effect Ref Stability', () => {
		it('should use latest effect implementation without re-triggering', async () => {
			const results: string[] = [];

			const { rerender } = renderHook(
				({ dep, label }) => {
					useAbortableEffect(
						async signal => {
							if (!signal.aborted) {
								results.push(label);
							}
						},
						[dep]
					);
				},
				{ initialProps: { dep: 1, label: 'first' } }
			);

			await waitFor(() => {
				expect(results).toEqual(['first']);
			});

			// Change effect implementation but keep dependency same
			rerender({ dep: 1, label: 'second' });

			await new Promise(resolve => setTimeout(resolve, 50));

			// Effect should NOT re-run (dependency unchanged)
			expect(results).toEqual(['first']);

			// Change dependency - should use new effect implementation
			rerender({ dep: 2, label: 'second' });

			await waitFor(() => {
				expect(results).toEqual(['first', 'second']);
			});
		});
	});
});
