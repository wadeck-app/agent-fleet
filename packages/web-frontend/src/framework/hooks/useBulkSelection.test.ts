import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBulkSelection } from './useBulkSelection';

describe('useBulkSelection', () => {
	describe('initialization', () => {
		it('should initialize with empty selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			expect(result.current.selectedIds).toBeInstanceOf(Set);
			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should provide all required methods', () => {
			const { result } = renderHook(() => useBulkSelection());

			expect(result.current.selectedIds).toBeDefined();
			expect(result.current.setSelectedIds).toBeInstanceOf(Function);
			expect(result.current.clearSelection).toBeInstanceOf(Function);
			expect(result.current.selectAll).toBeInstanceOf(Function);
			expect(result.current.toggleSelection).toBeInstanceOf(Function);
			expect(result.current.isSelected).toBeInstanceOf(Function);
		});
	});

	describe('isSelected', () => {
		it('should return false for unselected items', () => {
			const { result } = renderHook(() => useBulkSelection());

			expect(result.current.isSelected('1')).toBe(false);
			expect(result.current.isSelected('2')).toBe(false);
		});

		it('should return true for selected items', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.setSelectedIds(new Set(['1', '2']));
			});

			expect(result.current.isSelected('1')).toBe(true);
			expect(result.current.isSelected('2')).toBe(true);
			expect(result.current.isSelected('3')).toBe(false);
		});
	});

	describe('toggleSelection', () => {
		it('should add item when not selected', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.toggleSelection('1');
			});

			expect(result.current.selectedIds.has('1')).toBe(true);
			expect(result.current.selectedIds.size).toBe(1);
		});

		it('should remove item when already selected', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.setSelectedIds(new Set(['1', '2']));
			});

			act(() => {
				result.current.toggleSelection('1');
			});

			expect(result.current.selectedIds.has('1')).toBe(false);
			expect(result.current.selectedIds.has('2')).toBe(true);
			expect(result.current.selectedIds.size).toBe(1);
		});

		it('should toggle multiple items independently', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.toggleSelection('1');
				result.current.toggleSelection('2');
				result.current.toggleSelection('3');
			});

			expect(result.current.selectedIds.size).toBe(3);

			act(() => {
				result.current.toggleSelection('2');
			});

			expect(result.current.selectedIds.has('1')).toBe(true);
			expect(result.current.selectedIds.has('2')).toBe(false);
			expect(result.current.selectedIds.has('3')).toBe(true);
			expect(result.current.selectedIds.size).toBe(2);
		});

		it('should handle toggling same item multiple times', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.toggleSelection('1');
			});
			expect(result.current.selectedIds.has('1')).toBe(true);

			act(() => {
				result.current.toggleSelection('1');
			});
			expect(result.current.selectedIds.has('1')).toBe(false);

			act(() => {
				result.current.toggleSelection('1');
			});
			expect(result.current.selectedIds.has('1')).toBe(true);
		});
	});

	describe('selectAll', () => {
		it('should select all provided IDs', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2', '3', '4']);
			});

			expect(result.current.selectedIds.size).toBe(4);
			expect(result.current.selectedIds.has('1')).toBe(true);
			expect(result.current.selectedIds.has('2')).toBe(true);
			expect(result.current.selectedIds.has('3')).toBe(true);
			expect(result.current.selectedIds.has('4')).toBe(true);
		});

		it('should replace existing selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2']);
			});

			expect(result.current.selectedIds.size).toBe(2);

			act(() => {
				result.current.selectAll(['3', '4', '5']);
			});

			expect(result.current.selectedIds.size).toBe(3);
			expect(result.current.selectedIds.has('1')).toBe(false);
			expect(result.current.selectedIds.has('2')).toBe(false);
			expect(result.current.selectedIds.has('3')).toBe(true);
			expect(result.current.selectedIds.has('4')).toBe(true);
			expect(result.current.selectedIds.has('5')).toBe(true);
		});

		it('should handle empty array', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2']);
			});

			act(() => {
				result.current.selectAll([]);
			});

			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should handle duplicate IDs in array', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2', '2', '3', '1']);
			});

			// Set should deduplicate
			expect(result.current.selectedIds.size).toBe(3);
			expect(result.current.selectedIds.has('1')).toBe(true);
			expect(result.current.selectedIds.has('2')).toBe(true);
			expect(result.current.selectedIds.has('3')).toBe(true);
		});
	});

	describe('clearSelection', () => {
		it('should clear all selections', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2', '3']);
			});

			expect(result.current.selectedIds.size).toBe(3);

			act(() => {
				result.current.clearSelection();
			});

			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should be idempotent when selection is already empty', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.clearSelection();
			});

			expect(result.current.selectedIds.size).toBe(0);

			act(() => {
				result.current.clearSelection();
			});

			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should allow selecting again after clearing', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2']);
				result.current.clearSelection();
				result.current.toggleSelection('3');
			});

			expect(result.current.selectedIds.size).toBe(1);
			expect(result.current.selectedIds.has('3')).toBe(true);
		});
	});

	describe('setSelectedIds', () => {
		it('should directly set selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.setSelectedIds(new Set(['1', '2', '3']));
			});

			expect(result.current.selectedIds.size).toBe(3);
			expect(result.current.selectedIds.has('1')).toBe(true);
			expect(result.current.selectedIds.has('2')).toBe(true);
			expect(result.current.selectedIds.has('3')).toBe(true);
		});

		it('should replace existing selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.setSelectedIds(new Set(['1', '2']));
			});

			act(() => {
				result.current.setSelectedIds(new Set(['3', '4']));
			});

			expect(result.current.selectedIds.size).toBe(2);
			expect(result.current.selectedIds.has('3')).toBe(true);
			expect(result.current.selectedIds.has('4')).toBe(true);
			expect(result.current.selectedIds.has('1')).toBe(false);
		});

		it('should accept empty set', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.setSelectedIds(new Set(['1', '2']));
			});

			act(() => {
				result.current.setSelectedIds(new Set());
			});

			expect(result.current.selectedIds.size).toBe(0);
		});
	});

	describe('integration scenarios', () => {
		it('should simulate table row selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			// User clicks on first row
			act(() => {
				result.current.toggleSelection('row-1');
			});
			expect(result.current.isSelected('row-1')).toBe(true);

			// User clicks on second row
			act(() => {
				result.current.toggleSelection('row-2');
			});
			expect(result.current.isSelected('row-1')).toBe(true);
			expect(result.current.isSelected('row-2')).toBe(true);

			// User deselects first row
			act(() => {
				result.current.toggleSelection('row-1');
			});
			expect(result.current.isSelected('row-1')).toBe(false);
			expect(result.current.isSelected('row-2')).toBe(true);

			// User clicks "Clear Selection"
			act(() => {
				result.current.clearSelection();
			});
			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should simulate select all / deselect all', () => {
			const { result } = renderHook(() => useBulkSelection());

			const allIds = ['1', '2', '3', '4', '5'];

			// User clicks "Select All"
			act(() => {
				result.current.selectAll(allIds);
			});
			expect(result.current.selectedIds.size).toBe(5);

			// User clicks "Deselect All"
			act(() => {
				result.current.clearSelection();
			});
			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should simulate bulk delete workflow', () => {
			const { result } = renderHook(() => useBulkSelection());

			// Select multiple items for deletion
			act(() => {
				result.current.selectAll(['book-1', 'book-2', 'book-3']);
			});

			expect(result.current.selectedIds.size).toBe(3);

			// After successful deletion, clear selection
			act(() => {
				result.current.clearSelection();
			});

			expect(result.current.selectedIds.size).toBe(0);
		});

		it('should handle pagination with persistent selection', () => {
			const { result } = renderHook(() => useBulkSelection());

			// Page 1: Select some items
			act(() => {
				result.current.toggleSelection('item-1');
				result.current.toggleSelection('item-2');
			});

			// User navigates to page 2 (selection persists)
			expect(result.current.selectedIds.size).toBe(2);
			expect(result.current.isSelected('item-1')).toBe(true);

			// Page 2: Select more items
			act(() => {
				result.current.toggleSelection('item-11');
			});

			// Selection includes items from both pages
			expect(result.current.selectedIds.size).toBe(3);
			expect(result.current.isSelected('item-1')).toBe(true);
			expect(result.current.isSelected('item-11')).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('should handle very large selections', () => {
			const { result } = renderHook(() => useBulkSelection());

			const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`);

			act(() => {
				result.current.selectAll(largeArray);
			});

			expect(result.current.selectedIds.size).toBe(1000);
		});

		it('should handle IDs with special characters', () => {
			const { result } = renderHook(() => useBulkSelection());

			const specialIds = ['uuid-123-abc', 'id:with:colons', 'id/with/slashes'];

			act(() => {
				result.current.selectAll(specialIds);
			});

			expect(result.current.selectedIds.size).toBe(3);
			specialIds.forEach(id => {
				expect(result.current.isSelected(id)).toBe(true);
			});
		});

		it('should handle numeric string IDs', () => {
			const { result } = renderHook(() => useBulkSelection());

			act(() => {
				result.current.selectAll(['1', '2', '3']);
			});

			expect(result.current.isSelected('1')).toBe(true);
			expect(result.current.isSelected('2')).toBe(true);
		});
	});
});
