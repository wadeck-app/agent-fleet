import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePagination2 } from './usePagination2';

describe('usePagination2', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			expect(result.current).toHaveProperty('state');
			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});

		it('should have correct state shape', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			expect(result.current.fstate).toEqual({
				currentPage: 1,
				pageSize: 10,
				canGoPrevious: false,
				canGoNext: expect.any(Function),
			});
		});

		it('should have correct actions shape', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			expect(result.current.actions).toHaveProperty('setPage');
			expect(result.current.actions).toHaveProperty('setPageSize');
			expect(result.current.actions).toHaveProperty('nextPage');
			expect(result.current.actions).toHaveProperty('previousPage');
			expect(result.current.actions).toHaveProperty('resetPage');
		});
	});

	describe('fstate stability', () => {
		it('should have stable fstate reference when state does not change', () => {
			const { result, rerender } = renderHook(() => usePagination2({ pageSize: 10 }));

			const firstFstate = result.current.fstate;
			rerender();
			const secondFstate = result.current.fstate;

			// Reference equality - this is CRITICAL for useEffect deps
			expect(firstFstate).toBe(secondFstate);
		});

		it('should update fstate reference when state changes', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			const firstFstate = result.current.fstate;

			act(() => {
				result.current.actions.setPage(2);
			});

			const secondFstate = result.current.fstate;

			// Reference should change when actual state changes
			expect(firstFstate).not.toBe(secondFstate);
			expect(secondFstate.currentPage).toBe(2);
		});
	});

	describe('fillQuery', () => {
		it('should fill query correctly with current state', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({
				page: 1,
				pageSize: 10,
			});
		});

		it('should fill query with updated state after changes', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(3);
				result.current.actions.setPageSize(20);
			});

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query).toEqual({
				page: 3,
				pageSize: 20,
			});
		});

		it('should not override existing query properties', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			const query: Record<string, unknown> = { existing: 'value', search: 'test' };
			result.current.fillQuery(query);

			expect(query).toEqual({
				existing: 'value',
				search: 'test',
				page: 1,
				pageSize: 10,
			});
		});
	});

	describe('localStorage persistence', () => {
		it('should persist pageSize to localStorage', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10, storageId: 'test-items' }));

			act(() => {
				result.current.actions.setPageSize(20);
			});

			const stored = localStorage.getItem('test-items-pagination');
			expect(stored).toBeTruthy();
			expect(JSON.parse(stored!)).toEqual({ pageSize: 20 });
		});

		it('should load pageSize from localStorage on init', () => {
			// Pre-populate localStorage
			localStorage.setItem('test-items-pagination', JSON.stringify({ pageSize: 50 }));

			const { result } = renderHook(() => usePagination2({ pageSize: 10, storageId: 'test-items' }));

			expect(result.current.fstate.pageSize).toBe(50);
		});

		it('should not persist when storageId is not provided', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPageSize(20);
			});

			expect(localStorage.length).toBe(0);
		});

		it('should not persist currentPage (runtime only)', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10, storageId: 'test-items' }));

			act(() => {
				result.current.actions.setPage(5);
			});

			const stored = localStorage.getItem('test-items-pagination');
			const parsed = JSON.parse(stored!);

			expect(parsed).not.toHaveProperty('currentPage');
			expect(parsed.pageSize).toBe(10);
		});
	});

	describe('actions', () => {
		it('should setPage correctly', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(5);
			});

			expect(result.current.fstate.currentPage).toBe(5);
		});

		it('should not allow setting page below 1', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(0);
			});

			expect(result.current.fstate.currentPage).toBe(1); // Should stay at 1
		});

		it('should setPageSize and reset to page 1', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(5);
				result.current.actions.setPageSize(20);
			});

			expect(result.current.fstate.pageSize).toBe(20);
			expect(result.current.fstate.currentPage).toBe(1); // Should reset
		});

		it('should not allow setting pageSize below 1', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPageSize(0);
			});

			expect(result.current.fstate.pageSize).toBe(10); // Should not change
		});

		it('should nextPage correctly', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.nextPage();
			});

			expect(result.current.fstate.currentPage).toBe(2);
		});

		it('should previousPage correctly', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(3);
				result.current.actions.previousPage();
			});

			expect(result.current.fstate.currentPage).toBe(2);
		});

		it('should not go below page 1 when calling previousPage', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.previousPage();
			});

			expect(result.current.fstate.currentPage).toBe(1);
		});

		it('should resetPage to initialPage', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10, initialPage: 2 }));

			act(() => {
				result.current.actions.setPage(5);
				result.current.actions.resetPage();
			});

			expect(result.current.fstate.currentPage).toBe(2);
		});
	});

	describe('derived state', () => {
		it('should calculate canGoPrevious correctly', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			expect(result.current.fstate.canGoPrevious).toBe(false);

			act(() => {
				result.current.actions.setPage(2);
			});

			expect(result.current.fstate.canGoPrevious).toBe(true);
		});

		it('should calculate canGoNext correctly', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			act(() => {
				result.current.actions.setPage(5);
			});

			expect(result.current.fstate.canGoNext(10)).toBe(true);
			expect(result.current.fstate.canGoNext(5)).toBe(false);
			expect(result.current.fstate.canGoNext()).toBe(true); // Unknown total
		});
	});

	describe('initialPage option', () => {
		it('should start at initialPage when provided', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10, initialPage: 3 }));

			expect(result.current.fstate.currentPage).toBe(3);
		});

		it('should default to page 1 when initialPage not provided', () => {
			const { result } = renderHook(() => usePagination2({ pageSize: 10 }));

			expect(result.current.fstate.currentPage).toBe(1);
		});
	});

	describe('actions stability', () => {
		it('should have stable action references across re-renders', () => {
			const { result, rerender } = renderHook(() => usePagination2({ pageSize: 10 }));

			const firstActions = result.current.actions;
			rerender();
			const secondActions = result.current.actions;

			expect(firstActions).toBe(secondActions);
			expect(firstActions.setPage).toBe(secondActions.setPage);
			expect(firstActions.setPageSize).toBe(secondActions.setPageSize);
		});
	});
});
