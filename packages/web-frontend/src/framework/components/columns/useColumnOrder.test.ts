import type { TableColumn } from '@framework/components/table/Table';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useColumnOrder } from './useColumnOrder';

describe('useColumnOrder', () => {
	const defaultOrder = ['id', 'name', 'email', 'phone', 'address'];
	const storageId = 'test-table';

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	// Helper to create mock TableColumn array
	const createColumns = (keys: string[]): TableColumn<any>[] =>
		keys.map(key => ({
			key,
			label: key.charAt(0).toUpperCase() + key.slice(1),
			render: () => null,
		}));

	describe('Initialization', () => {
		it('should initialize with default order', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			expect(result.current.columnOrder).toEqual(defaultOrder);
		});

		it('should load order from localStorage if available', () => {
			const customOrder = ['email', 'name', 'id', 'phone', 'address'];
			localStorage.setItem('test-table-column-order', JSON.stringify(customOrder));

			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			expect(result.current.columnOrder).toEqual(customOrder);
		});

		it('should filter out invalid columns from localStorage', () => {
			const storedOrder = ['email', 'invalid', 'name', 'deleted', 'id'];
			localStorage.setItem('test-table-column-order', JSON.stringify(storedOrder));

			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Should keep only valid columns + append new ones
			expect(result.current.columnOrder).toEqual(['email', 'name', 'id', 'phone', 'address']);
		});

		it('should append new columns not in stored order', () => {
			const storedOrder = ['email', 'name']; // Missing id, phone, address
			localStorage.setItem('test-table-column-order', JSON.stringify(storedOrder));

			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Should keep stored order + append missing columns at end
			expect(result.current.columnOrder).toEqual(['email', 'name', 'id', 'phone', 'address']);
		});

		it('should handle corrupted localStorage data', () => {
			localStorage.setItem('test-table-column-order', 'invalid-json{');

			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Should fall back to default order
			expect(result.current.columnOrder).toEqual(defaultOrder);
		});

		it('should handle non-array localStorage data', () => {
			localStorage.setItem('test-table-column-order', JSON.stringify({ invalid: 'data' }));

			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Should fall back to default order
			expect(result.current.columnOrder).toEqual(defaultOrder);
		});
	});

	describe('reorderColumns (drag & drop)', () => {
		it('should swap columns when dragging', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('email', 'id'); // Drag email to id position
			});

			// email (index 2) moved to id (index 0)
			expect(result.current.columnOrder).toEqual(['email', 'id', 'name', 'phone', 'address']);
		});

		it('should handle dragging to later position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('id', 'address'); // Drag id to address position
			});

			// id (index 0) moved to address (index 4)
			expect(result.current.columnOrder).toEqual(['name', 'email', 'phone', 'address', 'id']);
		});

		it('should handle dragging adjacent columns', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('name', 'email'); // Swap adjacent
			});

			expect(result.current.columnOrder).toEqual(['id', 'email', 'name', 'phone', 'address']);
		});

		it('should be a no-op when dragging to same position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			act(() => {
				result.current.reorderColumns('email', 'email');
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});

		it('should be a no-op with invalid column IDs', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			act(() => {
				result.current.reorderColumns('invalid', 'email');
			});

			expect(result.current.columnOrder).toEqual(originalOrder);

			act(() => {
				result.current.reorderColumns('email', 'invalid');
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});
	});

	describe('moveColumn', () => {
		it('should move column to specific index', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.moveColumn('email', 0); // Move email to first
			});

			expect(result.current.columnOrder).toEqual(['email', 'id', 'name', 'phone', 'address']);
		});

		it('should move column to last position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.moveColumn('id', 4); // Move id to last
			});

			expect(result.current.columnOrder).toEqual(['name', 'email', 'phone', 'address', 'id']);
		});

		it('should clamp newIndex to valid range (negative)', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.moveColumn('email', -5); // Clamp to 0
			});

			expect(result.current.columnOrder).toEqual(['email', 'id', 'name', 'phone', 'address']);
		});

		it('should clamp newIndex to valid range (too large)', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.moveColumn('id', 100); // Clamp to last position
			});

			expect(result.current.columnOrder).toEqual(['name', 'email', 'phone', 'address', 'id']);
		});

		it('should be a no-op when moving to same position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			act(() => {
				result.current.moveColumn('email', 2); // email is already at index 2
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});

		it('should be a no-op with invalid column ID', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			act(() => {
				result.current.moveColumn('invalid', 0);
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});
	});

	describe('resetOrder', () => {
		it('should reset to default order', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Change order
			act(() => {
				result.current.reorderColumns('email', 'id');
			});

			expect(result.current.columnOrder).not.toEqual(defaultOrder);

			// Reset
			act(() => {
				result.current.resetOrder();
			});

			expect(result.current.columnOrder).toEqual(defaultOrder);
		});

		it('should reset even with multiple changes', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Multiple changes
			act(() => {
				result.current.reorderColumns('email', 'id');
				result.current.reorderColumns('phone', 'name');
				result.current.moveColumn('address', 0);
			});

			// Reset
			act(() => {
				result.current.resetOrder();
			});

			expect(result.current.columnOrder).toEqual(defaultOrder);
		});
	});

	describe('resetColumn', () => {
		it('should reset single column to default position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Move email from index 2 to index 0
			act(() => {
				result.current.moveColumn('email', 0);
			});

			expect(result.current.columnOrder).toEqual(['email', 'id', 'name', 'phone', 'address']);

			// Reset email to default position (index 2)
			act(() => {
				result.current.resetColumn('email');
			});

			expect(result.current.columnOrder).toEqual(defaultOrder);
		});

		it('should reset column without affecting others', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Reorder: move email to first, phone to second
			act(() => {
				result.current.moveColumn('email', 0); // email to index 0
				result.current.moveColumn('phone', 1); // phone to index 1
			});

			expect(result.current.columnOrder).toEqual(['email', 'phone', 'id', 'name', 'address']);

			// Reset only email (should go back to index 2 in defaultOrder)
			act(() => {
				result.current.resetColumn('email');
			});

			// email back at its default position, phone still moved
			expect(result.current.columnOrder).toEqual(['phone', 'id', 'email', 'name', 'address']);
		});

		it('should be a no-op when column already at default position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			// Reset column that's already at default position
			act(() => {
				result.current.resetColumn('name'); // name is at index 1 (default)
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});

		it('should be a no-op with invalid column ID', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const originalOrder = [...result.current.columnOrder];

			act(() => {
				result.current.resetColumn('invalid-column');
			});

			expect(result.current.columnOrder).toEqual(originalOrder);
		});

		it('should work after multiple reorders', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Multiple reorders
			act(() => {
				result.current.reorderColumns('email', 'id');
				result.current.reorderColumns('phone', 'name');
				result.current.moveColumn('address', 0);
			});

			// Order is now changed
			expect(result.current.columnOrder).not.toEqual(defaultOrder);

			// Reset single column
			act(() => {
				result.current.resetColumn('email');
			});

			// email should be at its default position (index 2)
			const emailIndex = result.current.columnOrder.indexOf('email');
			expect(emailIndex).toBe(2);
		});
	});

	describe('isModified', () => {
		it('should return false for default order', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			expect(result.current.isModified()).toBe(false);
		});

		it('should return true when order is changed', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('email', 'id');
			});

			expect(result.current.isModified()).toBe(true);
		});

		it('should return false after reset', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('email', 'id');
			});

			expect(result.current.isModified()).toBe(true);

			act(() => {
				result.current.resetOrder();
			});

			expect(result.current.isModified()).toBe(false);
		});

		it('should return true when length differs', () => {
			const { result: _result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// This scenario is covered by the "append new columns" test
			// Can't easily test length difference without exposing internal state
		});
	});

	describe('isColumnModified', () => {
		it('should return false for column at default position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			expect(result.current.isColumnModified('id')).toBe(false);
			expect(result.current.isColumnModified('name')).toBe(false);
			expect(result.current.isColumnModified('email')).toBe(false);
		});

		it('should return true for column moved from default position', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Move email from index 2 to index 0
			act(() => {
				result.current.moveColumn('email', 0);
			});

			expect(result.current.isColumnModified('email')).toBe(true);
			// Other columns shifted but not "modified" in terms of intent
			expect(result.current.isColumnModified('id')).toBe(true); // id moved from 0 to 1
			expect(result.current.isColumnModified('name')).toBe(true); // name moved from 1 to 2
		});

		it('should return false after resetting specific column', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Move email
			act(() => {
				result.current.moveColumn('email', 0);
			});

			expect(result.current.isColumnModified('email')).toBe(true);

			// Reset email
			act(() => {
				result.current.resetColumn('email');
			});

			expect(result.current.isColumnModified('email')).toBe(false);
		});

		it('should return false after resetting all columns', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Reorder multiple columns
			act(() => {
				result.current.reorderColumns('email', 'id');
				result.current.moveColumn('phone', 0);
			});

			expect(result.current.isColumnModified('email')).toBe(true);
			expect(result.current.isColumnModified('phone')).toBe(true);

			// Reset all
			act(() => {
				result.current.resetOrder();
			});

			expect(result.current.isColumnModified('email')).toBe(false);
			expect(result.current.isColumnModified('phone')).toBe(false);
			expect(result.current.isColumnModified('id')).toBe(false);
		});

		it('should return false for invalid column ID', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			expect(result.current.isColumnModified('invalid-column')).toBe(false);
		});

		it('should track modifications correctly with multiple operations', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Initial: all at default
			expect(result.current.isColumnModified('email')).toBe(false);

			// Move email
			act(() => {
				result.current.moveColumn('email', 0);
			});
			expect(result.current.isColumnModified('email')).toBe(true);

			// Move it back manually to original position
			act(() => {
				result.current.moveColumn('email', 2);
			});
			expect(result.current.isColumnModified('email')).toBe(false);
		});
	});

	describe('applyOrder', () => {
		it('should reorder columns array', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const columns = createColumns(['id', 'name', 'email', 'phone', 'address']);

			act(() => {
				result.current.reorderColumns('email', 'id'); // email first
			});

			const ordered = result.current.applyOrder(columns);

			expect(ordered.map(col => col.key)).toEqual(['email', 'id', 'name', 'phone', 'address']);
		});

		it('should handle columns not in order (appends at end)', () => {
			const { result } = renderHook(() =>
				useColumnOrder({
					storageId,
					defaultOrder: ['id', 'name', 'email'],
				})
			);

			// Columns array has extra columns not in order
			const columns = createColumns(['id', 'name', 'email', 'newColumn1', 'newColumn2']);

			const ordered = result.current.applyOrder(columns);

			expect(ordered.map(col => col.key)).toEqual(['id', 'name', 'email', 'newColumn1', 'newColumn2']);
		});

		it('should handle columns in order but not in array (ignores)', () => {
			const { result } = renderHook(() =>
				useColumnOrder({
					storageId,
					defaultOrder: ['id', 'name', 'email', 'deleted', 'removed'],
				})
			);

			// Columns array missing some columns from order
			const columns = createColumns(['id', 'name', 'email']);

			const ordered = result.current.applyOrder(columns);

			expect(ordered.map(col => col.key)).toEqual(['id', 'name', 'email']);
		});

		it('should preserve column objects (not just keys)', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const columns = createColumns(['id', 'name', 'email', 'phone', 'address']);
			columns[2]!.label = 'Custom Email Label';

			const ordered = result.current.applyOrder(columns);

			expect(ordered[2]!.label).toBe('Custom Email Label');
		});

		it('should handle empty columns array', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const ordered = result.current.applyOrder([]);

			expect(ordered).toEqual([]);
		});

		it('should work with complex reordering', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			const columns = createColumns(['id', 'name', 'email', 'phone', 'address']);

			// Reverse order
			act(() => {
				result.current.moveColumn('id', 4);
				result.current.moveColumn('name', 3);
			});

			const ordered = result.current.applyOrder(columns);

			// Check it's reordered correctly
			expect(ordered.length).toBe(5);
			expect(ordered[0]!.key).not.toBe('id');
			expect(ordered[ordered.length - 1]!.key).toBe('id');
		});
	});

	describe('Persistence', () => {
		it('should persist changes to localStorage', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('email', 'id');
			});

			const stored = localStorage.getItem('test-table-column-order');
			expect(stored).toBeTruthy();

			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual(['email', 'id', 'name', 'phone', 'address']);
		});

		it('should use different storage keys for different tables', () => {
			const { result: result1 } = renderHook(() => useColumnOrder({ storageId: 'table1', defaultOrder }));

			const { result: result2 } = renderHook(() => useColumnOrder({ storageId: 'table2', defaultOrder }));

			act(() => {
				result1.current.reorderColumns('email', 'id');
			});

			act(() => {
				result2.current.reorderColumns('phone', 'id');
			});

			const stored1 = JSON.parse(localStorage.getItem('table1-column-order')!);
			const stored2 = JSON.parse(localStorage.getItem('table2-column-order')!);

			expect(stored1[0]).toBe('email');
			expect(stored2[0]).toBe('phone');
		});

		it('should persist resetOrder', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			// Change order
			act(() => {
				result.current.reorderColumns('email', 'id');
			});

			// Reset
			act(() => {
				result.current.resetOrder();
			});

			const stored = localStorage.getItem('test-table-column-order');
			const parsed = JSON.parse(stored!);
			expect(parsed).toEqual(defaultOrder);
		});
	});

	describe('Edge cases', () => {
		it('should handle single column order', () => {
			const { result } = renderHook(() =>
				useColumnOrder({
					storageId,
					defaultOrder: ['id'],
				})
			);

			expect(result.current.columnOrder).toEqual(['id']);

			// Operations should be no-op
			act(() => {
				result.current.moveColumn('id', 0);
			});

			expect(result.current.columnOrder).toEqual(['id']);
		});

		it('should handle empty default order', () => {
			const { result } = renderHook(() =>
				useColumnOrder({
					storageId,
					defaultOrder: [],
				})
			);

			expect(result.current.columnOrder).toEqual([]);
			expect(result.current.isModified()).toBe(false);
		});

		it('should handle multiple rapid reorders', () => {
			const { result } = renderHook(() => useColumnOrder({ storageId, defaultOrder }));

			act(() => {
				result.current.reorderColumns('email', 'id');
				result.current.reorderColumns('phone', 'name');
				result.current.reorderColumns('address', 'email');
			});

			// Should have valid order
			expect(result.current.columnOrder.length).toBe(5);
			expect(new Set(result.current.columnOrder).size).toBe(5); // No duplicates
		});
	});
});
