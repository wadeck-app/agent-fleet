import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCacheControl2 } from './useCacheControl2';

describe('useCacheControl2', () => {
	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current).toHaveProperty('state');
			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});

		it('should have correct state shape', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current.fstate).toEqual({
				cacheId: 0,
				isRefreshing: false,
			});
		});

		it('should have correct actions shape', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current.actions).toHaveProperty('refresh');
			expect(result.current.actions).toHaveProperty('reset');
			expect(result.current.actions).toHaveProperty('setCacheId');
			expect(result.current.actions).toHaveProperty('setIsRefreshing');
			expect(typeof result.current.actions.refresh).toBe('function');
			expect(typeof result.current.actions.reset).toBe('function');
			expect(typeof result.current.actions.setCacheId).toBe('function');
			expect(typeof result.current.actions.setIsRefreshing).toBe('function');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderHook(() => useCacheControl2());

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			// Reference equality - this is CRITICAL for useEffect deps
			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when state changes', () => {
			const { result } = renderHook(() => useCacheControl2());

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.refresh();
			});

			const secondFstate = result.current.fstate;

			// Reference should change when actual state changes
			expect(firstFstate).not.toBe(secondFstate);
			expect(secondFstate.cacheId).toBe(1);
		});
	});

	describe('refresh action', () => {
		it('should increment cacheId when refresh() called', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current.fstate.cacheId).toBe(0);

			act(() => {
				result.current.actions.refresh();
			});

			expect(result.current.fstate.cacheId).toBe(1);

			act(() => {
				result.current.actions.refresh();
			});

			expect(result.current.fstate.cacheId).toBe(2);
		});
	});

	describe('reset action', () => {
		it('should reset cacheId to initialCacheId', () => {
			const { result } = renderHook(() => useCacheControl2({ initialCacheId: 5 }));

			expect(result.current.fstate.cacheId).toBe(5);

			act(() => {
				result.current.actions.refresh();
				result.current.actions.refresh();
			});

			expect(result.current.fstate.cacheId).toBe(7);

			act(() => {
				result.current.actions.reset();
			});

			expect(result.current.fstate.cacheId).toBe(5);
		});

		it('should reset to 0 by default', () => {
			const { result } = renderHook(() => useCacheControl2());

			act(() => {
				result.current.actions.refresh();
				result.current.actions.refresh();
			});

			expect(result.current.fstate.cacheId).toBe(2);

			act(() => {
				result.current.actions.reset();
			});

			expect(result.current.fstate.cacheId).toBe(0);
		});
	});

	describe('setCacheId action', () => {
		it('should set cacheId to specific value', () => {
			const { result } = renderHook(() => useCacheControl2());

			act(() => {
				result.current.actions.setCacheId(42);
			});

			expect(result.current.fstate.cacheId).toBe(42);
		});

		it('should reject negative cacheId values', () => {
			const { result } = renderHook(() => useCacheControl2());

			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			act(() => {
				result.current.actions.setCacheId(-1);
			});

			expect(result.current.fstate.cacheId).toBe(0);
			expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid cacheId'));

			consoleWarnSpy.mockRestore();
		});
	});

	describe('setIsRefreshing action', () => {
		it('should set and toggle isRefreshing state', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current.fstate.isRefreshing).toBe(false);

			act(() => {
				result.current.actions.setIsRefreshing(true);
			});

			expect(result.current.fstate.isRefreshing).toBe(true);

			act(() => {
				result.current.actions.setIsRefreshing(false);
			});

			expect(result.current.fstate.isRefreshing).toBe(false);
		});
	});

	describe('fillQuery', () => {
		it('should add cacheId to query when enabled', () => {
			const { result } = renderHook(() => useCacheControl2({ enabled: true }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query.cacheId).toBe(0);

			act(() => {
				result.current.actions.refresh();
			});

			const query2: Record<string, unknown> = {};
			result.current.fillQuery(query2);

			expect(query2.cacheId).toBe(1);
		});

		it('should not add cacheId to query when disabled', () => {
			const { result } = renderHook(() => useCacheControl2({ enabled: false }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query.cacheId).toBeUndefined();

			act(() => {
				result.current.actions.refresh();
			});

			const query2: Record<string, unknown> = {};
			result.current.fillQuery(query2);

			expect(query2.cacheId).toBeUndefined();
		});

		it('should add cacheId by default (enabled=true)', () => {
			const { result } = renderHook(() => useCacheControl2());

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query.cacheId).toBe(0);
		});

		it('should mutate the passed query object', () => {
			const { result } = renderHook(() => useCacheControl2());

			const query: Record<string, unknown> = { page: 1, search: 'test' };
			result.current.fillQuery(query);

			expect(query).toEqual({
				page: 1,
				search: 'test',
				cacheId: 0,
			});
		});
	});

	describe('integration scenarios', () => {
		it('should work for manual refresh workflow', () => {
			const { result } = renderHook(() => useCacheControl2());

			const query: Record<string, unknown> = { page: 1 };
			result.current.fillQuery(query);
			expect(query.cacheId).toBe(0);

			act(() => {
				result.current.actions.setIsRefreshing(true);
				result.current.actions.refresh();
			});

			const query2: Record<string, unknown> = { page: 1 };
			result.current.fillQuery(query2);
			expect(query2.cacheId).toBe(1);

			act(() => {
				result.current.actions.setIsRefreshing(false);
			});

			expect(result.current.fstate.isRefreshing).toBe(false);
		});

		it('should work for auto-refresh after mutation', () => {
			const { result } = renderHook(() => useCacheControl2());

			// Initial state
			let query: Record<string, unknown> = { page: 1 };
			result.current.fillQuery(query);
			expect(query.cacheId).toBe(0);

			// Simulate mutation (create, update, delete)
			act(() => {
				result.current.actions.setIsRefreshing(true);
			});

			// After mutation completes, trigger refresh
			act(() => {
				result.current.actions.refresh();
				result.current.actions.setIsRefreshing(false);
			});

			// New query with incremented cacheId
			query = { page: 1 };
			result.current.fillQuery(query);
			expect(query.cacheId).toBe(1);
		});

		it('should work for polling scenario', () => {
			const { result } = renderHook(() => useCacheControl2());

			// Simulate polling - multiple refreshes over time
			for (let i = 0; i < 5; i++) {
				act(() => {
					result.current.actions.refresh();
				});
			}

			expect(result.current.fstate.cacheId).toBe(5);

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);
			expect(query.cacheId).toBe(5);
		});
	});

	describe('edge cases', () => {
		it('should handle initialCacheId option', () => {
			const { result } = renderHook(() => useCacheControl2({ initialCacheId: 100 }));

			expect(result.current.fstate.cacheId).toBe(100);

			act(() => {
				result.current.actions.refresh();
			});

			expect(result.current.fstate.cacheId).toBe(101);
		});

		it('should handle enabled=false option', () => {
			const { result } = renderHook(() => useCacheControl2({ enabled: false }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({});
			expect('cacheId' in query).toBe(false);
		});

		it('should preserve other query properties when filling', () => {
			const { result } = renderHook(() => useCacheControl2());

			const query: Record<string, unknown> = {
				page: 1,
				pageSize: 10,
				search: 'test',
				sortBy: 'name',
			};

			result.current.fillQuery(query);

			expect(query).toEqual({
				page: 1,
				pageSize: 10,
				search: 'test',
				sortBy: 'name',
				cacheId: 0,
			});
		});
	});
});
