import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useColumnVisibility } from './useColumnVisibility';

describe('useColumnVisibility', () => {
	const allColumns = ['id', 'name', 'email', 'phone', 'address'];
	const storageId = 'test-table';

	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		localStorage.clear();
	});

	describe('Initialization', () => {
		it('should initialize with all columns visible by default', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			expect(result.current.visibleColumns.size).toBe(5);
			allColumns.forEach(col => {
				expect(result.current.isColumnVisible(col)).toBe(true);
			});
		});

		it('should initialize with specified default columns', () => {
			const { result } = renderHook(() =>
				useColumnVisibility(allColumns, {
					storageId,
					defaultVisible: ['id', 'name'],
				})
			);

			expect(result.current.visibleColumns.size).toBe(2);
			expect(result.current.isColumnVisible('id')).toBe(true);
			expect(result.current.isColumnVisible('name')).toBe(true);
			expect(result.current.isColumnVisible('email')).toBe(false);
		});

		it('should load state from localStorage if available', () => {
			localStorage.setItem('test-table-column-visibility', JSON.stringify(['id', 'name', 'email']));

			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			expect(result.current.visibleColumns.size).toBe(3);
			expect(result.current.isColumnVisible('id')).toBe(true);
			expect(result.current.isColumnVisible('name')).toBe(true);
			expect(result.current.isColumnVisible('email')).toBe(true);
			expect(result.current.isColumnVisible('phone')).toBe(false);
		});

		it('should filter out invalid columns from localStorage', () => {
			localStorage.setItem('test-table-column-visibility', JSON.stringify(['id', 'invalid', 'name']));

			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			expect(result.current.visibleColumns.size).toBe(2);
			expect(result.current.isColumnVisible('id')).toBe(true);
			expect(result.current.isColumnVisible('name')).toBe(true);
			expect(result.current.isColumnVisible('invalid' as any)).toBe(false);
		});

		it('should handle corrupted localStorage data', () => {
			localStorage.setItem('test-table-column-visibility', 'invalid-json{');

			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			// Should fall back to default (all visible)
			expect(result.current.visibleColumns.size).toBe(5);
		});
	});

	describe('Toggle operations', () => {
		it('should toggle column visibility', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			act(() => {
				result.current.toggleColumn('email');
			});

			expect(result.current.isColumnVisible('email')).toBe(false);

			act(() => {
				result.current.toggleColumn('email');
			});

			expect(result.current.isColumnVisible('email')).toBe(true);
		});

		it('should show a hidden column', () => {
			const { result } = renderHook(() =>
				useColumnVisibility(allColumns, {
					storageId,
					defaultVisible: ['id'],
				})
			);

			act(() => {
				result.current.showColumn('name');
			});

			expect(result.current.isColumnVisible('name')).toBe(true);
		});

		it('should hide a visible column', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			act(() => {
				result.current.hideColumn('email');
			});

			expect(result.current.isColumnVisible('email')).toBe(false);
		});
	});

	describe('Bulk operations', () => {
		it('should show all columns', () => {
			const { result } = renderHook(() =>
				useColumnVisibility(allColumns, {
					storageId,
					defaultVisible: ['id'],
				})
			);

			act(() => {
				result.current.showAll();
			});

			expect(result.current.visibleColumns.size).toBe(5);
			allColumns.forEach(col => {
				expect(result.current.isColumnVisible(col)).toBe(true);
			});
		});

		it('should hide all columns', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			act(() => {
				result.current.hideAll();
			});

			expect(result.current.visibleColumns.size).toBe(0);
			allColumns.forEach(col => {
				expect(result.current.isColumnVisible(col)).toBe(false);
			});
		});

		it('should reset to default columns', () => {
			const { result } = renderHook(() =>
				useColumnVisibility(allColumns, {
					storageId,
					defaultVisible: ['id', 'name'],
				})
			);

			// Change visibility
			act(() => {
				result.current.showAll();
			});

			expect(result.current.visibleColumns.size).toBe(5);

			// Reset to default
			act(() => {
				result.current.resetColumns();
			});

			expect(result.current.visibleColumns.size).toBe(2);
			expect(result.current.isColumnVisible('id')).toBe(true);
			expect(result.current.isColumnVisible('name')).toBe(true);
			expect(result.current.isColumnVisible('email')).toBe(false);
		});
	});

	describe('Persistence', () => {
		it('should persist changes to localStorage', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			act(() => {
				result.current.hideColumn('email');
				result.current.hideColumn('phone');
			});

			const stored = localStorage.getItem('test-table-column-visibility');
			expect(stored).toBeTruthy();

			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual(['id', 'name', 'address']);
		});

		it('should use different storage keys for different tables', () => {
			const { result: result1 } = renderHook(() => useColumnVisibility(allColumns, { storageId: 'table1' }));

			const { result: result2 } = renderHook(() => useColumnVisibility(allColumns, { storageId: 'table2' }));

			act(() => {
				result1.current.hideColumn('email');
			});

			act(() => {
				result2.current.hideColumn('phone');
			});

			expect(result1.current.isColumnVisible('email')).toBe(false);
			expect(result1.current.isColumnVisible('phone')).toBe(true);

			expect(result2.current.isColumnVisible('email')).toBe(true);
			expect(result2.current.isColumnVisible('phone')).toBe(false);
		});
	});

	describe('getVisibilityState', () => {
		it('should return visibility state as object', () => {
			const { result } = renderHook(() =>
				useColumnVisibility(allColumns, {
					storageId,
					defaultVisible: ['id', 'name'],
				})
			);

			const state = result.current.getVisibilityState();

			expect(state).toEqual({
				id: true,
				name: true,
				email: false,
				phone: false,
				address: false,
			});
		});

		it('should update visibility state object after changes', () => {
			const { result } = renderHook(() => useColumnVisibility(allColumns, { storageId }));

			act(() => {
				result.current.hideColumn('email');
			});

			const state = result.current.getVisibilityState();

			expect(state.email).toBe(false);
			expect(state.id).toBe(true);
		});
	});
});
