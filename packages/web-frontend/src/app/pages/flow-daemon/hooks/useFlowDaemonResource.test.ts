import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowDaemonResource } from './useFlowDaemonResource';

// Same shape as ApiError (message = backend `error` text, numeric status) without importing the real API layer
class BackendError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>(promiseResolve => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

describe('useFlowDaemonResource', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts loading then exposes the data', async () => {
		const fetcher = vi.fn().mockResolvedValue('payload');

		const { result } = renderHook(() => useFlowDaemonResource(fetcher));

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data).toBe('payload');
		expect(result.current.error).toBeNull();
	});

	it('exposes the backend error message of an API error (not a generic one)', async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValue(new BackendError('Flow daemon is not running. Start it with: flow daemon start', 503));

		const { result } = renderHook(() => useFlowDaemonResource(fetcher));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe('Flow daemon is not running. Start it with: flow daemon start');
		expect(result.current.data).toBeNull();
	});

	it('refetches when the fetcher changes and ignores the superseded response', async () => {
		const first = createDeferred<string>();
		const second = createDeferred<string>();
		const firstFetcher = vi.fn(() => first.promise);
		const secondFetcher = vi.fn(() => second.promise);

		const { result, rerender } = renderHook(({ fetcher }) => useFlowDaemonResource(fetcher), {
			initialProps: { fetcher: firstFetcher },
		});
		rerender({ fetcher: secondFetcher });

		await act(async () => {
			second.resolve('second');
		});
		await act(async () => {
			first.resolve('first (late)');
		});

		expect(result.current.data).toBe('second');
	});

	it('refresh reloads the data', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
		const { result } = renderHook(() => useFlowDaemonResource(fetcher));
		await waitFor(() => expect(result.current.data).toBe('v1'));

		act(() => {
			result.current.refresh();
		});

		await waitFor(() => expect(result.current.data).toBe('v2'));
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	describe('polling', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it('refetches on the interval without raising the loading flag', async () => {
			const fetcher = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
			const { result } = renderHook(() => useFlowDaemonResource(fetcher, 1000));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(result.current.data).toBe('v1');

			let loadingDuringPoll = false;
			await act(async () => {
				vi.advanceTimersByTime(1000);
				loadingDuringPoll = result.current.loading;
				await vi.advanceTimersByTimeAsync(0);
			});

			expect(loadingDuringPoll).toBe(false);
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(result.current.data).toBe('v2');
		});

		it('stops polling on unmount', async () => {
			const fetcher = vi.fn().mockResolvedValue('v');
			const { unmount } = renderHook(() => useFlowDaemonResource(fetcher, 1000));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});

			unmount();
			await vi.advanceTimersByTimeAsync(5000);

			expect(fetcher).toHaveBeenCalledTimes(1);
		});
	});
});
