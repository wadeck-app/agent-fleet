import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SortConfig, useSorting } from './useSorting';

describe('useSorting', () => {
	const storageId = 'test-table';

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	describe('Initialization', () => {
		it('should initialize with empty sort configs by default', () => {
			const { result } = renderHook(() => useSorting());

			expect(result.current.sortConfigs).toEqual([]);
		});

		it('should initialize with default sort configuration', () => {
			const defaultSort: SortConfig[] = [{ key: 'name', direction: 'asc' }];

			const { result } = renderHook(() => useSorting({ defaultSort }));

			expect(result.current.sortConfigs).toEqual(defaultSort);
		});

		it('should load sort configuration from localStorage when storageId is provided', () => {
			const savedSort: SortConfig[] = [{ key: 'email', direction: 'desc' }];
			localStorage.setItem(`${storageId}-sorting`, JSON.stringify(savedSort));

			const { result } = renderHook(() => useSorting({ storageId }));

			expect(result.current.sortConfigs).toEqual(savedSort);
		});

		it('should load multi-column sort from localStorage', () => {
			const savedSort: SortConfig[] = [
				{ key: 'name', direction: 'asc' },
				{ key: 'email', direction: 'desc' },
			];
			localStorage.setItem(`${storageId}-sorting`, JSON.stringify(savedSort));

			const { result } = renderHook(() => useSorting({ storageId }));

			expect(result.current.sortConfigs).toEqual(savedSort);
		});

		it('should handle corrupted localStorage data', () => {
			localStorage.setItem(`${storageId}-sorting`, 'invalid-json{');

			const { result } = renderHook(() => useSorting({ storageId }));

			expect(result.current.sortConfigs).toEqual([]);
		});

		it('should filter out invalid sort configs from localStorage', () => {
			const invalidData = [
				{ key: 'name', direction: 'asc' },
				{ key: 'email' }, // Missing direction
				{ direction: 'desc' }, // Missing key
				{ key: 'phone', direction: 'invalid' }, // Invalid direction
				{ key: 'address', direction: 'desc' },
			];
			localStorage.setItem(`${storageId}-sorting`, JSON.stringify(invalidData));

			const { result } = renderHook(() => useSorting({ storageId }));

			expect(result.current.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'address', direction: 'desc' },
			]);
		});

		it('should not load from localStorage when storageId is not provided', () => {
			const savedSort: SortConfig[] = [{ key: 'email', direction: 'desc' }];
			localStorage.setItem(`${storageId}-sorting`, JSON.stringify(savedSort));

			const { result } = renderHook(() => useSorting());

			// Should not load from localStorage without storageId
			expect(result.current.sortConfigs).toEqual([]);
		});
	});

	describe('Single-column sorting', () => {
		it('should set sort on first click', () => {
			const { result } = renderHook(() => useSorting({ multiColumn: false }));

			act(() => {
				result.current.handleSort('name', false);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should toggle direction on second click', () => {
			const { result } = renderHook(() => useSorting({ multiColumn: false }));

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('name', false);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'name', direction: 'desc' }]);
		});

		it('should clear sort on third click', () => {
			const { result } = renderHook(() => useSorting({ multiColumn: false }));

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('name', false);
			});

			expect(result.current.sortConfigs).toEqual([]);
		});

		it('should replace sort when clicking different column', () => {
			const { result } = renderHook(() => useSorting({ multiColumn: false }));

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', false);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'email', direction: 'asc' }]);
		});
	});

	describe('Multi-column sorting', () => {
		it('should add sort with shift+click', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			expect(result.current.sortConfigs).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'email', direction: 'asc' },
			]);
		});

		it('should toggle direction in multi-column mode', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			act(() => {
				result.current.handleSort('name', true);
			});

			expect(result.current.sortConfigs).toEqual([
				{ key: 'name', direction: 'desc' },
				{ key: 'email', direction: 'asc' },
			]);
		});

		it('should remove sort on third click in multi-column mode', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			act(() => {
				result.current.handleSort('name', true);
			});

			act(() => {
				result.current.handleSort('name', true);
			});

			expect(result.current.sortConfigs).toEqual([{ key: 'email', direction: 'asc' }]);
		});
	});

	describe('Persistence', () => {
		it('should persist single-column sort to localStorage', () => {
			const { result } = renderHook(() => useSorting({ storageId }));

			act(() => {
				result.current.handleSort('name', false);
			});

			const stored = localStorage.getItem(`${storageId}-sorting`);
			expect(stored).toBeTruthy();

			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual([{ key: 'name', direction: 'asc' }]);
		});

		it('should persist multi-column sort to localStorage', () => {
			const { result } = renderHook(() => useSorting({ storageId }));

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			const stored = localStorage.getItem(`${storageId}-sorting`);
			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual([
				{ key: 'name', direction: 'asc' },
				{ key: 'email', direction: 'asc' },
			]);
		});

		it('should persist cleared sort to localStorage', () => {
			const { result } = renderHook(() => useSorting({ storageId }));

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.clearSort();
			});

			const stored = localStorage.getItem(`${storageId}-sorting`);
			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual([]);
		});

		it('should not persist to localStorage when storageId is not provided', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			const stored = localStorage.getItem(`${storageId}-sorting`);
			expect(stored).toBeNull();
		});

		it('should use different storage keys for different tables', () => {
			const { result: result1 } = renderHook(() => useSorting({ storageId: 'table1' }));

			const { result: result2 } = renderHook(() => useSorting({ storageId: 'table2' }));

			act(() => {
				result1.current.handleSort('name', false);
			});

			act(() => {
				result2.current.handleSort('email', false);
			});

			const stored1 = localStorage.getItem('table1-sorting');
			const stored2 = localStorage.getItem('table2-sorting');

			expect(JSON.parse(stored1!)).toEqual([{ key: 'name', direction: 'asc' }]);
			expect(JSON.parse(stored2!)).toEqual([{ key: 'email', direction: 'asc' }]);
		});
	});

	describe('clearSort', () => {
		it('should clear all sort configurations', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			act(() => {
				result.current.clearSort();
			});

			expect(result.current.sortConfigs).toEqual([]);
		});
	});

	describe('setSortConfigs', () => {
		it('should set sort configurations directly', () => {
			const { result } = renderHook(() => useSorting());

			const newConfigs: SortConfig[] = [
				{ key: 'name', direction: 'desc' },
				{ key: 'email', direction: 'asc' },
			];

			act(() => {
				result.current.setSortConfigs(newConfigs);
			});

			expect(result.current.sortConfigs).toEqual(newConfigs);
		});
	});

	describe('getSortInfo', () => {
		it('should return null for unsorted column', () => {
			const { result } = renderHook(() => useSorting());

			const info = result.current.getSortInfo('name');

			expect(info).toEqual({
				direction: null,
				priority: null,
			});
		});

		it('should return direction for sorted column', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			const info = result.current.getSortInfo('name');

			expect(info).toEqual({
				direction: 'asc',
				priority: null,
			});
		});

		it('should return priority for multi-column sort', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			act(() => {
				result.current.handleSort('email', true);
			});

			const nameInfo = result.current.getSortInfo('name');
			const emailInfo = result.current.getSortInfo('email');

			expect(nameInfo).toEqual({
				direction: 'asc',
				priority: 1,
			});

			expect(emailInfo).toEqual({
				direction: 'asc',
				priority: 2,
			});
		});

		it('should not return priority for single-column sort', () => {
			const { result } = renderHook(() => useSorting());

			act(() => {
				result.current.handleSort('name', false);
			});

			const info = result.current.getSortInfo('name');

			expect(info.priority).toBeNull();
		});
	});
});
