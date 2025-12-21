import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultiSelect } from './useMultiSelect';

interface TestItem {
	id: string;
	name: string;
}

describe('useMultiSelect', () => {
	let items: TestItem[];

	beforeEach(() => {
		items = [
			{ id: '1', name: 'Item 1' },
			{ id: '2', name: 'Item 2' },
			{ id: '3', name: 'Item 3' },
			{ id: '4', name: 'Item 4' },
			{ id: '5', name: 'Item 5' },
		];
	});

	describe('Basic Functionality', () => {
		it('should initialize with no selections', () => {
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
				})
			);

			expect(result.current.selectedIds.size).toBe(0);
			expect(result.current.selectedCount).toBe(0);
			expect(result.current.isAllSelected).toBe(false);
			expect(result.current.isSomeSelected).toBe(false);
		});

		it('should work in controlled mode', () => {
			const selectedIds = new Set(['1', '2']);
			const onSelectionChange = vi.fn();

			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds,
					onSelectionChange,
				})
			);

			expect(result.current.selectedIds).toBe(selectedIds);
			expect(result.current.selectedCount).toBe(2);
			expect(result.current.isSelected('1')).toBe(true);
			expect(result.current.isSelected('2')).toBe(true);
			expect(result.current.isSelected('3')).toBe(false);
		});

		it('should work in uncontrolled mode', () => {
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0);
			});

			expect(result.current.selectedCount).toBe(1);
			expect(result.current.isSelected('1')).toBe(true);
		});
	});

	describe('Single Item Selection', () => {
		it('should toggle selection on', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
		});

		it('should toggle selection off', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1', '2']),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['2']));
		});

		it('should force select', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0, { force: 'select' });
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
		});

		it('should force deselect', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1']),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0, { force: 'deselect' });
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set());
		});
	});

	describe('Range Selection (Shift+Click)', () => {
		it('should select range when shift clicking', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			// Select first item
			act(() => {
				result.current.toggleSelection('1', 0);
			});

			onSelectionChange.mockClear();

			// Shift+click third item
			act(() => {
				result.current.toggleSelection('3', 2, { shiftKey: true });
			});

			// Should select items 1, 2, 3
			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3']));
		});

		it('should deselect contiguous block when range is already selected', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1', '2', '3']),
					onSelectionChange,
				})
			);

			// Click first item to set anchor
			act(() => {
				result.current.toggleSelection('1', 0);
			});

			// Shift+click third item (all are already selected)
			act(() => {
				result.current.toggleSelection('3', 2, { shiftKey: true });
			});

			// Should deselect the entire contiguous block
			expect(onSelectionChange).toHaveBeenCalledWith(new Set());
		});

		it('should handle reverse range selection', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			// Select fifth item
			act(() => {
				result.current.toggleSelection('5', 4);
			});

			onSelectionChange.mockClear();

			// Shift+click second item (reverse direction)
			act(() => {
				result.current.toggleSelection('2', 1, { shiftKey: true });
			});

			// Should select items 2, 3, 4, 5
			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['2', '3', '4', '5']));
		});

		it('should not update anchor on shift+click', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			// Select first item (anchor = 0)
			act(() => {
				result.current.toggleSelection('1', 0);
			});

			// Shift+click third item (should select 1-3, anchor stays at 0)
			act(() => {
				result.current.toggleSelection('3', 2, { shiftKey: true });
			});

			onSelectionChange.mockClear();

			// Shift+click fifth item (should select 1-5, not 3-5)
			act(() => {
				result.current.toggleSelection('5', 4, { shiftKey: true });
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3', '4', '5']));
		});
	});

	describe('Select All / Deselect All', () => {
		it('should select all items', () => {
			const onSelectionChange = vi.fn();
			const { result, rerender } = renderHook(
				({ selectedIds }: { selectedIds: Set<string> }) =>
					useMultiSelect({
						items,
						getItemId: item => item.id,
						selectedIds,
						onSelectionChange,
					}),
				{ initialProps: { selectedIds: new Set<string>() } }
			);

			act(() => {
				result.current.selectAll();
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3', '4', '5']));

			// Simulate controlled update
			rerender({ selectedIds: new Set(['1', '2', '3', '4', '5']) });
			expect(result.current.isAllSelected).toBe(true);
		});

		it('should deselect all items', () => {
			const onSelectionChange = vi.fn();
			const { result, rerender } = renderHook(
				({ selectedIds }: { selectedIds: Set<string> }) =>
					useMultiSelect({
						items,
						getItemId: item => item.id,
						selectedIds,
						onSelectionChange,
					}),
				{ initialProps: { selectedIds: new Set(['1', '2', '3']) } }
			);

			act(() => {
				result.current.deselectAll();
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set());

			// Simulate controlled update
			rerender({ selectedIds: new Set() });
			expect(result.current.isAllSelected).toBe(false);
			expect(result.current.isSomeSelected).toBe(false);
		});

		it('should toggle all (select when none selected)', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleAll();
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3', '4', '5']));
		});

		it('should toggle all (deselect when some selected)', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1', '2']),
					onSelectionChange,
				})
			);

			act(() => {
				result.current.toggleAll();
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set());
		});
	});

	describe('Selection State Indicators', () => {
		it('should report isAllSelected correctly', () => {
			const { result, rerender } = renderHook(
				({ selectedIds }: { selectedIds: Set<string> }) =>
					useMultiSelect({
						items,
						getItemId: item => item.id,
						selectedIds,
						onSelectionChange: () => {},
					}),
				{ initialProps: { selectedIds: new Set<string>() } }
			);

			expect(result.current.isAllSelected).toBe(false);

			rerender({ selectedIds: new Set(['1', '2', '3']) });
			expect(result.current.isAllSelected).toBe(false);

			rerender({ selectedIds: new Set(['1', '2', '3', '4', '5']) });
			expect(result.current.isAllSelected).toBe(true);
		});

		it('should report isSomeSelected correctly', () => {
			const { result, rerender } = renderHook(
				({ selectedIds }: { selectedIds: Set<string> }) =>
					useMultiSelect({
						items,
						getItemId: item => item.id,
						selectedIds,
						onSelectionChange: () => {},
					}),
				{ initialProps: { selectedIds: new Set<string>() } }
			);

			expect(result.current.isSomeSelected).toBe(false);

			rerender({ selectedIds: new Set(['1', '2', '3']) });
			expect(result.current.isSomeSelected).toBe(true);

			rerender({ selectedIds: new Set(['1', '2', '3', '4', '5']) });
			expect(result.current.isSomeSelected).toBe(false); // All selected, not "some"
		});

		it('should report selectedCount correctly', () => {
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1', '2', '3']),
					onSelectionChange: () => {},
				})
			);

			expect(result.current.selectedCount).toBe(3);
		});
	});

	describe('Single Selection Mode', () => {
		it('should only allow one selection in single mode', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
					mode: 'single',
				})
			);

			// Select first item
			act(() => {
				result.current.toggleSelection('1', 0);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));

			onSelectionChange.mockClear();

			// Select second item (should deselect first)
			act(() => {
				result.current.toggleSelection('2', 1);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['2']));
		});

		it('should deselect when clicking selected item in single mode', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1']),
					onSelectionChange,
					mode: 'single',
				})
			);

			act(() => {
				result.current.toggleSelection('1', 0);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(new Set());
		});

		it('should not do range selection in single mode', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['1']),
					onSelectionChange,
					mode: 'single',
				})
			);

			act(() => {
				result.current.toggleSelection('3', 2, { shiftKey: true });
			});

			// Should just select item 3 (no range)
			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['3']));
		});
	});

	describe('Cross-Page Selection', () => {
		it('should maintain selections from previous pages', () => {
			const selectedIds = new Set(['1', '2', '10', '15']); // IDs from different pages
			const currentPageItems = items; // Only page 1 items

			const { result } = renderHook(() =>
				useMultiSelect({
					items: currentPageItems,
					getItemId: item => item.id,
					selectedIds,
					onSelectionChange: () => {},
				})
			);

			// Should still show all 4 selected even though only 2 are on current page
			expect(result.current.selectedCount).toBe(4);
			expect(result.current.isSelected('1')).toBe(true);
			expect(result.current.isSelected('10')).toBe(true); // From another page
			expect(result.current.isAllSelected).toBe(false); // Not all current page items selected
		});

		it('should handle selectAll with cross-page selections', () => {
			const onSelectionChange = vi.fn();
			const selectedIds = new Set(['10', '15']); // IDs from other pages

			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds,
					onSelectionChange,
				})
			);

			act(() => {
				result.current.selectAll();
			});

			// Should select all current page items (1-5) but keep previous selections (10, 15)
			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2', '3', '4', '5']));
		});
	});

	describe('setSelectedIds', () => {
		it('should set selection directly', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			const newSelection = new Set(['2', '4']);

			act(() => {
				result.current.setSelectedIds(newSelection);
			});

			expect(onSelectionChange).toHaveBeenCalledWith(newSelection);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty items array', () => {
			const { result } = renderHook(() =>
				useMultiSelect({
					items: [] as TestItem[],
					getItemId: item => item.id,
					selectedIds: new Set<string>(),
					onSelectionChange: () => {},
				})
			);

			expect(result.current.isAllSelected).toBe(false);
			expect(result.current.isSomeSelected).toBe(false);
			expect(result.current.selectedCount).toBe(0);
		});

		it('should handle selections for items not in current view', () => {
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(['100', '200']), // IDs not in items
					onSelectionChange: () => {},
				})
			);

			// These selections should persist (cross-page)
			expect(result.current.selectedCount).toBe(2);
			expect(result.current.isSelected('100')).toBe(true);
			expect(result.current.isAllSelected).toBe(false);
			expect(result.current.isSomeSelected).toBe(false); // None of current items selected
		});

		it('should handle shift+click when no anchor is set', () => {
			const onSelectionChange = vi.fn();
			const { result } = renderHook(() =>
				useMultiSelect({
					items,
					getItemId: item => item.id,
					selectedIds: new Set(),
					onSelectionChange,
				})
			);

			// Shift+click without prior selection (no anchor)
			act(() => {
				result.current.toggleSelection('3', 2, { shiftKey: true });
			});

			// Should just select the single item
			expect(onSelectionChange).toHaveBeenCalledWith(new Set(['3']));
		});
	});
});
