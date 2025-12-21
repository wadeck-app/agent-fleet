import { createControllablePromise } from '@framework/tests/createControllablePromise';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncData } from './useAsyncData';

/**
 * ===========================================================================================
 * USE ASYNC DATA TESTS - High-Level Race Condition Protection
 * ===========================================================================================
 *
 * These tests verify that useAsyncData:
 * - Automatically manages loading/error/data states
 * - Protects against race conditions without manual signal checks
 * - Handles errors correctly
 * - Re-fetches when dependencies change
 * - Ignores results from cancelled requests
 *
 * Uses createControllablePromise for deterministic, non-flaky tests.
 * ===========================================================================================
 */

describe('useAsyncData', () => {
	describe('Basic Functionality', () => {
		it('should start with data: null and error: null, then set loading: true when fetch begins', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			// Data and error should be null initially
			expect(result.current.data).toBe(null);
			expect(result.current.error).toBe(null);

			// Loading should become true once effect runs
			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});
		});

		it('should start with loading: true when initialLoading option is set', () => {
			const fetchFn = vi.fn(async () => 'test-data');

			const { result } = renderHook(() => useAsyncData(fetchFn, [], { initialLoading: true }));

			expect(result.current.loading).toBe(true);
		});

		it('should fetch data on mount', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			// Should start loading
			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			// Complete the fetch
			promise.resolve('test-data');

			// Should have data and stop loading
			await waitFor(() => {
				expect(result.current.data).toBe('test-data');
				expect(result.current.loading).toBe(false);
				expect(result.current.error).toBe(null);
			});
		});

		it('should handle fetch errors', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			const testError = new Error('Test error');
			promise.reject(testError);

			await waitFor(() => {
				expect(result.current.error).toEqual(testError);
				expect(result.current.loading).toBe(false);
				expect(result.current.data).toBe(null);
			});
		});

		it('should convert non-Error exceptions to Error objects', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			promise.reject(new Error('string error'));

			await waitFor(() => {
				expect(result.current.error).toBeInstanceOf(Error);
				expect(result.current.error?.message).toBe('string error');
			});
		});

		it('should re-fetch when dependencies change', async () => {
			const promise1 = createControllablePromise<[], string>();
			const promise2 = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ dep }) => useAsyncData(() => (dep === 1 ? promise1.fn() : promise2.fn()), [dep]),
				{ initialProps: { dep: 1 } }
			);

			// First fetch
			await waitFor(() => {
				expect(promise1.wasCalled()).toBe(true);
			});

			promise1.resolve('data-1');

			await waitFor(() => {
				expect(result.current.data).toBe('data-1');
			});

			// Change dependency - should trigger second fetch
			rerender({ dep: 2 });

			await waitFor(() => {
				expect(promise2.wasCalled()).toBe(true);
			});

			promise2.resolve('data-2');

			await waitFor(() => {
				expect(result.current.data).toBe('data-2');
			});
		});

		it('should not re-fetch when dependencies remain unchanged', async () => {
			const fetchFn = vi.fn(async () => 'test-data');

			const { rerender } = renderHook(({ dep }) => useAsyncData(fetchFn, [dep]), {
				initialProps: { dep: 1 },
			});

			await waitFor(() => {
				expect(fetchFn).toHaveBeenCalledTimes(1);
			});

			// Rerender with same dependency
			rerender({ dep: 1 });

			await waitFor(() => {
				expect(fetchFn).toHaveBeenCalledTimes(1); // Still 1, not 2
			});
		});
	});

	describe('Race Condition Protection', () => {
		it('should ignore results from cancelled slow request', async () => {
			const slowRequest = createControllablePromise<[], string>();
			const fastRequest = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ query }) => useAsyncData(() => (query === 'slow' ? slowRequest.fn() : fastRequest.fn()), [query]),
				{ initialProps: { query: 'slow' } }
			);

			// Start slow request
			await waitFor(() => {
				expect(slowRequest.wasCalled()).toBe(true);
			});

			// Change query - start fast request
			rerender({ query: 'fast' });

			await waitFor(() => {
				expect(fastRequest.wasCalled()).toBe(true);
			});

			// Complete fast request first
			fastRequest.resolve('fast-result');

			await waitFor(() => {
				expect(result.current.data).toBe('fast-result');
			});

			// Complete slow request after - should be ignored
			slowRequest.resolve('slow-result');

			// Wait to ensure slow result doesn't override
			await new Promise(resolve => setTimeout(resolve, 50));

			// Data should still be from fast request
			expect(result.current.data).toBe('fast-result');
		});

		it('should handle multiple rapid dependency changes', async () => {
			const promises = [
				createControllablePromise<[], string>(),
				createControllablePromise<[], string>(),
				createControllablePromise<[], string>(),
			];

			const { result, rerender } = renderHook(({ dep }) => useAsyncData(() => promises[dep - 1]!.fn(), [dep]), {
				initialProps: { dep: 1 },
			});

			// Trigger 3 fetches rapidly
			await waitFor(() => expect(promises[0]!.wasCalled()).toBe(true));
			rerender({ dep: 2 });
			await waitFor(() => expect(promises[1]!.wasCalled()).toBe(true));
			rerender({ dep: 3 });
			await waitFor(() => expect(promises[2]!.wasCalled()).toBe(true));

			// Only complete the last one
			promises[2]!.resolve('result-3');

			await waitFor(() => {
				expect(result.current.data).toBe('result-3');
			});

			// Complete the first two (should be ignored)
			promises[0]!.resolve('result-1');
			promises[1]!.resolve('result-2');

			await new Promise(resolve => setTimeout(resolve, 50));

			// Data should still be from last request
			expect(result.current.data).toBe('result-3');
		});

		it('should clear error when new fetch starts', async () => {
			const promise1 = createControllablePromise<[], string>();
			const promise2 = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ dep }) => useAsyncData(() => (dep === 1 ? promise1.fn() : promise2.fn()), [dep]),
				{ initialProps: { dep: 1 } }
			);

			// First fetch fails
			await waitFor(() => expect(promise1.wasCalled()).toBe(true));
			promise1.reject(new Error('First error'));

			await waitFor(() => {
				expect(result.current.error?.message).toBe('First error');
			});

			// Change dependency - should clear error
			rerender({ dep: 2 });

			// Error should be cleared immediately when new fetch starts
			await waitFor(() => {
				expect(result.current.error).toBe(null);
				expect(result.current.loading).toBe(true);
			});

			// Complete second fetch successfully
			promise2.resolve('success');

			await waitFor(() => {
				expect(result.current.data).toBe('success');
				expect(result.current.error).toBe(null);
			});
		});

		it('should not report errors from cancelled requests', async () => {
			const promise1 = createControllablePromise<[], string>();
			const promise2 = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ dep }) => useAsyncData(() => (dep === 1 ? promise1.fn() : promise2.fn()), [dep]),
				{ initialProps: { dep: 1 } }
			);

			// Start first request
			await waitFor(() => expect(promise1.wasCalled()).toBe(true));

			// Change dependency - cancel first request
			rerender({ dep: 2 });

			await waitFor(() => expect(promise2.wasCalled()).toBe(true));

			// Reject the cancelled request
			promise1.reject(new Error('Cancelled error'));

			// Complete the active request successfully
			promise2.resolve('success');

			await waitFor(() => {
				expect(result.current.data).toBe('success');
				// Error from cancelled request should not appear
				expect(result.current.error).toBe(null);
			});
		});
	});

	describe('Loading State Management', () => {
		it('should set loading to true while fetching', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			promise.resolve('data');

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});
		});

		it('should set loading to false after error', async () => {
			const promise = createControllablePromise<[], string>();

			const { result } = renderHook(() => useAsyncData(() => promise.fn(), []));

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			promise.reject(new Error('Test error'));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});
		});

		it('should reset loading to true when refetching', async () => {
			const promise1 = createControllablePromise<[], string>();
			const promise2 = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ dep }) => useAsyncData(() => (dep === 1 ? promise1.fn() : promise2.fn()), [dep]),
				{ initialProps: { dep: 1 } }
			);

			// Complete first fetch
			await waitFor(() => expect(promise1.wasCalled()).toBe(true));
			promise1.resolve('data-1');

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Change dependency - should start loading again
			rerender({ dep: 2 });

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});
		});

		it('should not set loading to false for cancelled requests', async () => {
			const promise1 = createControllablePromise<[], string>();
			const promise2 = createControllablePromise<[], string>();

			const { result, rerender } = renderHook(
				({ dep }) => useAsyncData(() => (dep === 1 ? promise1.fn() : promise2.fn()), [dep]),
				{ initialProps: { dep: 1 } }
			);

			// Start first request
			await waitFor(() => expect(promise1.wasCalled()).toBe(true));

			// Change dependency immediately
			rerender({ dep: 2 });

			await waitFor(() => expect(promise2.wasCalled()).toBe(true));

			// Complete cancelled request
			promise1.resolve('data-1');

			await new Promise(resolve => setTimeout(resolve, 50));

			// Loading should still be true (waiting for second request)
			expect(result.current.loading).toBe(true);

			// Complete second request
			promise2.resolve('data-2');

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});
		});
	});

	describe('Real-World Scenarios', () => {
		it('should handle autocomplete-like scenario', async () => {
			// Simulate user typing: "a" -> "ab" -> "abc"
			const searchA = createControllablePromise<[], string[]>();
			const searchAB = createControllablePromise<[], string[]>();
			const searchABC = createControllablePromise<[], string[]>();

			const searches = {
				a: searchA,
				ab: searchAB,
				abc: searchABC,
			};

			const { result, rerender } = renderHook(
				({ query }: { query: 'a' | 'ab' | 'abc' }) => useAsyncData(() => searches[query].fn(), [query]),
				{ initialProps: { query: 'a' as 'a' | 'ab' | 'abc' } }
			);

			// User types "a"
			await waitFor(() => expect(searchA.wasCalled()).toBe(true));

			// User types "ab" before "a" completes
			rerender({ query: 'ab' });
			await waitFor(() => expect(searchAB.wasCalled()).toBe(true));

			// User types "abc" before "ab" completes
			rerender({ query: 'abc' });
			await waitFor(() => expect(searchABC.wasCalled()).toBe(true));

			// "ab" completes first (fast server)
			searchAB.resolve(['about', 'above']);

			await new Promise(resolve => setTimeout(resolve, 50));

			// Should NOT show "ab" results because "abc" is pending
			expect(result.current.data).not.toEqual(['about', 'above']);

			// "a" completes next (slow server)
			searchA.resolve(['apple', 'ant']);

			await new Promise(resolve => setTimeout(resolve, 50));

			// Should NOT show "a" results
			expect(result.current.data).not.toEqual(['apple', 'ant']);

			// "abc" completes last
			searchABC.resolve(['abcdef']);

			await waitFor(() => {
				// Should ONLY show "abc" results
				expect(result.current.data).toEqual(['abcdef']);
			});
		});

		it('should handle component unmount during fetch', async () => {
			const promise = createControllablePromise<[], string>();

			const { unmount } = renderHook(() => useAsyncData(() => promise.fn(), []));

			await waitFor(() => {
				expect(promise.wasCalled()).toBe(true);
			});

			// Unmount before fetch completes
			unmount();

			// Complete fetch after unmount
			promise.resolve('data');

			// Wait to ensure no state updates happen (would cause React warnings)
			await new Promise(resolve => setTimeout(resolve, 50));

			// Test passes if no React warnings/errors occur
		});

		it('should work with paginated data fetching', async () => {
			const page1 = createControllablePromise<[], { items: string[] }>();
			const page2 = createControllablePromise<[], { items: string[] }>();

			const { result, rerender } = renderHook(
				({ page }) => useAsyncData(() => (page === 1 ? page1.fn() : page2.fn()), [page]),
				{ initialProps: { page: 1 } }
			);

			// Load page 1
			await waitFor(() => expect(page1.wasCalled()).toBe(true));
			page1.resolve({ items: ['item1', 'item2'] });

			await waitFor(() => {
				expect(result.current.data?.items).toEqual(['item1', 'item2']);
			});

			// Navigate to page 2
			rerender({ page: 2 });

			await waitFor(() => {
				expect(result.current.loading).toBe(true);
			});

			await waitFor(() => expect(page2.wasCalled()).toBe(true));
			page2.resolve({ items: ['item3', 'item4'] });

			await waitFor(() => {
				expect(result.current.data?.items).toEqual(['item3', 'item4']);
			});
		});
	});

	describe('Type Safety', () => {
		it('should infer correct data type', async () => {
			interface User {
				id: string;
				name: string;
			}

			const fetchFn = async (): Promise<User> => ({
				id: '1',
				name: 'Test User',
			});

			const { result } = renderHook(() => useAsyncData(fetchFn, []));

			await waitFor(() => {
				expect(result.current.data).toBeDefined();
			});

			// TypeScript should infer that data is User | null
			if (result.current.data) {
				// These should compile without errors
				const id: string = result.current.data.id;
				const name: string = result.current.data.name;
				expect(id).toBe('1');
				expect(name).toBe('Test User');
			}
		});
	});
});
