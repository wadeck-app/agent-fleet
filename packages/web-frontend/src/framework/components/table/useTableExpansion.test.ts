import { act, renderHook } from '@testing-library/react';

import { useTableExpansion } from './useTableExpansion';

describe('useTableExpansion', () => {
	it('should start with empty expanded set by default', () => {
		const { result } = renderHook(() => useTableExpansion());

		expect(result.current.expandedIds.size).toBe(0);
		expect(result.current.isExpanded('1')).toBe(false);
	});

	it('should initialize with default expanded IDs', () => {
		const defaultExpandedIds = new Set(['1', '2']);
		const { result } = renderHook(() => useTableExpansion({ defaultExpandedIds }));

		expect(result.current.expandedIds.size).toBe(2);
		expect(result.current.isExpanded('1')).toBe(true);
		expect(result.current.isExpanded('2')).toBe(true);
		expect(result.current.isExpanded('3')).toBe(false);
	});

	it('should toggle expanded state', () => {
		const { result } = renderHook(() => useTableExpansion());

		expect(result.current.isExpanded('1')).toBe(false);

		act(() => {
			result.current.toggleExpanded('1');
		});

		expect(result.current.isExpanded('1')).toBe(true);

		act(() => {
			result.current.toggleExpanded('1');
		});

		expect(result.current.isExpanded('1')).toBe(false);
	});

	it('should expand multiple rows independently', () => {
		const { result } = renderHook(() => useTableExpansion());

		act(() => {
			result.current.toggleExpanded('1');
			result.current.toggleExpanded('2');
			result.current.toggleExpanded('3');
		});

		expect(result.current.isExpanded('1')).toBe(true);
		expect(result.current.isExpanded('2')).toBe(true);
		expect(result.current.isExpanded('3')).toBe(true);
		expect(result.current.expandedIds.size).toBe(3);
	});

	it('should expand all rows', () => {
		const { result } = renderHook(() => useTableExpansion());
		const allIds = ['1', '2', '3', '4', '5'];

		act(() => {
			result.current.expandAll(allIds);
		});

		expect(result.current.expandedIds.size).toBe(5);
		allIds.forEach(id => {
			expect(result.current.isExpanded(id)).toBe(true);
		});
	});

	it('should collapse all rows', () => {
		const defaultExpandedIds = new Set(['1', '2', '3']);
		const { result } = renderHook(() => useTableExpansion({ defaultExpandedIds }));

		expect(result.current.expandedIds.size).toBe(3);

		act(() => {
			result.current.collapseAll();
		});

		expect(result.current.expandedIds.size).toBe(0);
		expect(result.current.isExpanded('1')).toBe(false);
		expect(result.current.isExpanded('2')).toBe(false);
		expect(result.current.isExpanded('3')).toBe(false);
	});

	it('should work with controlled state', () => {
		const onExpandedChange = vi.fn();
		const expandedIds = new Set(['1']);

		const { result, rerender } = renderHook(
			({ expandedIds }) =>
				useTableExpansion({
					expandedIds,
					onExpandedChange,
				}),
			{ initialProps: { expandedIds } }
		);

		expect(result.current.isExpanded('1')).toBe(true);
		expect(result.current.isExpanded('2')).toBe(false);

		// Toggle expansion
		act(() => {
			result.current.toggleExpanded('2');
		});

		// Check that callback was called with new state
		expect(onExpandedChange).toHaveBeenCalledTimes(1);
		const newExpandedIds = onExpandedChange.mock.calls[0]![0];
		expect(newExpandedIds.has('1')).toBe(true);
		expect(newExpandedIds.has('2')).toBe(true);

		// Rerender with new controlled state
		rerender({ expandedIds: newExpandedIds });

		expect(result.current.isExpanded('1')).toBe(true);
		expect(result.current.isExpanded('2')).toBe(true);
	});

	it('should handle expandAll with controlled state', () => {
		const onExpandedChange = vi.fn();
		const expandedIds = new Set<string>();

		const { result } = renderHook(() =>
			useTableExpansion({
				expandedIds,
				onExpandedChange,
			})
		);

		const allIds = ['1', '2', '3'];

		act(() => {
			result.current.expandAll(allIds);
		});

		expect(onExpandedChange).toHaveBeenCalledTimes(1);
		const newExpandedIds = onExpandedChange.mock.calls[0]![0];
		expect(newExpandedIds.size).toBe(3);
		expect(newExpandedIds.has('1')).toBe(true);
		expect(newExpandedIds.has('2')).toBe(true);
		expect(newExpandedIds.has('3')).toBe(true);
	});

	it('should handle collapseAll with controlled state', () => {
		const onExpandedChange = vi.fn();
		const expandedIds = new Set(['1', '2', '3']);

		const { result } = renderHook(() =>
			useTableExpansion({
				expandedIds,
				onExpandedChange,
			})
		);

		act(() => {
			result.current.collapseAll();
		});

		expect(onExpandedChange).toHaveBeenCalledTimes(1);
		const newExpandedIds = onExpandedChange.mock.calls[0]![0];
		expect(newExpandedIds.size).toBe(0);
	});
});
