import { act } from 'react';

import { renderHook, waitFor } from '@testing-library/react';

import { useTableRefreshing } from './useTableRefreshing';

describe('useTableRefreshing', () => {
	it('should return false on initial render', () => {
		const { result } = renderHook(() =>
			useTableRefreshing(
				{
					page: 1,
					pageSize: 10,
					sortBy: 'name',
				},
				false
			)
		);

		expect(result.current).toBe(false);
	});

	it('should return true when a dependency changes', async () => {
		const { result, rerender } = renderHook(({ deps, loading }) => useTableRefreshing(deps, loading), {
			initialProps: {
				deps: { page: 1, pageSize: 10, sortBy: 'name' },
				loading: false,
			},
		});

		// Initial render
		expect(result.current).toBe(false);

		// Change page and start loading
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 10, sortBy: 'name' },
				loading: true,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(true);
		});
	});

	it('should return false when loading completes', async () => {
		const { result, rerender } = renderHook(({ deps, loading }) => useTableRefreshing(deps, loading), {
			initialProps: {
				deps: { page: 1, pageSize: 10, sortBy: 'name' },
				loading: true,
			},
		});

		// Change page while loading
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 10, sortBy: 'name' },
				loading: true,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(true);
		});

		// Loading completes
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 10, sortBy: 'name' },
				loading: false,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(false);
		});
	});

	it('should handle multiple dependency changes', async () => {
		const { result, rerender } = renderHook(({ deps, loading }) => useTableRefreshing(deps, loading), {
			initialProps: {
				deps: { page: 1, pageSize: 10, sortBy: 'name' },
				loading: true,
			},
		});

		// Change page
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 10, sortBy: 'name' },
				loading: true,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(true);
		});

		// Loading completes
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 10, sortBy: 'name' },
				loading: false,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(false);
		});

		// Change pageSize and start loading again
		act(() => {
			rerender({
				deps: { page: 2, pageSize: 20, sortBy: 'name' },
				loading: true,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(true);
		});
	});

	it('should handle sortBy change', async () => {
		const { result, rerender } = renderHook(({ deps, loading }) => useTableRefreshing(deps, loading), {
			initialProps: {
				deps: { page: 1, pageSize: 10, sortBy: 'name' },
				loading: false,
			},
		});

		// Change sortBy and start loading
		act(() => {
			rerender({
				deps: { page: 1, pageSize: 10, sortBy: 'age' },
				loading: true,
			});
		});

		await waitFor(() => {
			expect(result.current).toBe(true);
		});
	});

	it('should not trigger refreshing if no dependency changes', () => {
		const { result, rerender } = renderHook(({ deps, loading }) => useTableRefreshing(deps, loading), {
			initialProps: {
				deps: { page: 1, pageSize: 10, sortBy: 'name' },
				loading: false,
			},
		});

		// Same dependencies
		rerender({
			deps: { page: 1, pageSize: 10, sortBy: 'name' },
			loading: false,
		});

		expect(result.current).toBe(false);
	});
});
