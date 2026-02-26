import { useDualListState } from '@framework/hooks/useDualListState';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createControlledPromise } from '@/test/utils/asyncUtils';

/**
 * ===========================================================================================
 * UNIT TESTS FOR useDualListState HOOK
 * ===========================================================================================
 *
 * Tests verify that the hook correctly manages optimistic updates using controlled promises.
 * All tests focus on state transitions DURING async operations (before promise resolves).
 *
 * Test strategy:
 * 1. Create controlled promise
 * 2. Call action (associate/dissociate/reorder)
 * 3. BEFORE resolving promise, verify:
 *    - Optimistic state applied (item moved)
 *    - Loading state active
 * 4. Resolve/reject promise
 * 5. Verify state cleared/rolled back
 *
 * Coverage target: 100%
 *
 * ===========================================================================================
 */

interface MockItem {
	id: string;
	name: string;
}

const mockItems: MockItem[] = [
	{ id: 'item-1', name: 'Item One' },
	{ id: 'item-2', name: 'Item Two' },
	{ id: 'item-3', name: 'Item Three' },
	{ id: 'item-4', name: 'Item Four' },
];

describe('useDualListState - Optimistic Updates', () => {
	it('ASSOCIATE: should move item optimistically and show loading state DURING API call', async () => {
		const associatePromise = createControlledPromise<void>();
		const onAssociate = vi.fn().mockReturnValue(associatePromise.promise);

		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate,
				onDissociate: vi.fn(),
			})
		);

		// Initial state: item-3 in right panel
		expect(result.current.rightItems.map(i => i.id)).toContain('item-3');
		expect(result.current.leftItems.map(i => i.id)).not.toContain('item-3');
		expect(result.current.loadingItems.has('item-3')).toBe(false);

		// Trigger associate
		act(() => {
			void result.current.actions.associate('item-3');
		});

		// CRITICAL: Verify DURING API call (before promise resolves)
		await waitFor(() => {
			// Item should move to left panel immediately (optimistic)
			expect(result.current.leftItems.map(i => i.id)).toContain('item-3');
			// Item should NOT be in right panel anymore
			expect(result.current.rightItems.map(i => i.id)).not.toContain('item-3');
			// Loading state should be active
			expect(result.current.loadingItems.has('item-3')).toBe(true);
		});

		// Verify API was called
		expect(onAssociate).toHaveBeenCalledWith('item-3');

		// Resolve promise (API completes successfully)
		act(() => {
			associatePromise.resolve();
		});

		// Loading state should clear
		await waitFor(() => {
			expect(result.current.loadingItems.has('item-3')).toBe(false);
		});

		// Item still in left panel (optimistic state kept until props sync)
		expect(result.current.leftItems.map(i => i.id)).toContain('item-3');
	});

	it('ASSOCIATE: should rollback on API error', async () => {
		const associatePromise = createControlledPromise<void>();
		const onAssociate = vi.fn().mockReturnValue(associatePromise.promise);

		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate,
				onDissociate: vi.fn(),
			})
		);

		// Trigger associate
		act(() => {
			void result.current.actions.associate('item-3');
		});

		// Item moved optimistically
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toContain('item-3');
		});

		// Reject promise (API error)
		act(() => {
			associatePromise.reject(new Error('Network error'));
		});

		// Item should rollback to right panel
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).not.toContain('item-3');
			expect(result.current.rightItems.map(i => i.id)).toContain('item-3');
			expect(result.current.loadingItems.has('item-3')).toBe(false);
		});
	});

	it('DISSOCIATE: should move item optimistically and show loading state DURING API call', async () => {
		const dissociatePromise = createControlledPromise<void>();
		const onDissociate = vi.fn().mockReturnValue(dissociatePromise.promise);

		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate,
			})
		);

		// Initial state: item-1 in left panel
		expect(result.current.leftItems.map(i => i.id)).toContain('item-1');
		expect(result.current.rightItems.map(i => i.id)).not.toContain('item-1');
		expect(result.current.loadingItems.has('item-1')).toBe(false);

		// Trigger dissociate
		act(() => {
			void result.current.actions.dissociate('item-1');
		});

		// CRITICAL: Verify DURING API call
		await waitFor(() => {
			// Item should move to right panel immediately (optimistic)
			expect(result.current.rightItems.map(i => i.id)).toContain('item-1');
			// Item should NOT be in left panel anymore
			expect(result.current.leftItems.map(i => i.id)).not.toContain('item-1');
			// Loading state should be active
			expect(result.current.loadingItems.has('item-1')).toBe(true);
		});

		// Verify API was called
		expect(onDissociate).toHaveBeenCalledWith('item-1');

		// Resolve promise
		act(() => {
			dissociatePromise.resolve();
		});

		// Loading state should clear
		await waitFor(() => {
			expect(result.current.loadingItems.has('item-1')).toBe(false);
		});

		// Item still in right panel
		expect(result.current.rightItems.map(i => i.id)).toContain('item-1');
	});

	it('DISSOCIATE: should rollback on API error', async () => {
		const dissociatePromise = createControlledPromise<void>();
		const onDissociate = vi.fn().mockReturnValue(dissociatePromise.promise);

		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate,
			})
		);

		// Trigger dissociate
		act(() => {
			void result.current.actions.dissociate('item-1');
		});

		// Item moved optimistically
		await waitFor(() => {
			expect(result.current.rightItems.map(i => i.id)).toContain('item-1');
		});

		// Reject promise (API error)
		act(() => {
			dissociatePromise.reject(new Error('Network error'));
		});

		// Item should rollback to left panel
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toContain('item-1');
			expect(result.current.rightItems.map(i => i.id)).not.toContain('item-1');
			expect(result.current.loadingItems.has('item-1')).toBe(false);
		});
	});

	it('REORDER: should show reordering state on ALL items DURING API call', async () => {
		const reorderPromise = createControlledPromise<void>();
		const onReorder = vi.fn().mockReturnValue(reorderPromise.promise);

		const associatedIds = new Set(['item-1', 'item-2', 'item-3']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate: vi.fn(),
				onReorder,
			})
		);

		// Initial state: no reordering
		expect(result.current.reorderingIds.size).toBe(0);
		const initialOrder = result.current.leftItems.map(i => i.id);
		expect(initialOrder).toEqual(['item-1', 'item-2', 'item-3']);

		// Trigger reorder (move item-2 before item-1)
		act(() => {
			void result.current.actions.reorder('item-2', 'item-1');
		});

		// CRITICAL: Verify DURING API call
		await waitFor(() => {
			// ALL left items should have reordering state
			expect(result.current.reorderingIds.has('item-1')).toBe(true);
			expect(result.current.reorderingIds.has('item-2')).toBe(true);
			expect(result.current.reorderingIds.has('item-3')).toBe(true);

			// Order should change optimistically
			const newOrder = result.current.leftItems.map(i => i.id);
			expect(newOrder).toEqual(['item-2', 'item-1', 'item-3']);
		});

		// Verify API was called
		expect(onReorder).toHaveBeenCalledWith('item-2', 'item-1');

		// Resolve promise
		act(() => {
			reorderPromise.resolve();
		});

		// Reordering state should clear
		await waitFor(() => {
			expect(result.current.reorderingIds.size).toBe(0);
		});

		// Order still changed (optimistic state kept)
		expect(result.current.leftItems.map(i => i.id)).toEqual(['item-2', 'item-1', 'item-3']);
	});

	it('REORDER: should rollback on API error', async () => {
		const reorderPromise = createControlledPromise<void>();
		const onReorder = vi.fn().mockReturnValue(reorderPromise.promise);

		const associatedIds = new Set(['item-1', 'item-2', 'item-3']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate: vi.fn(),
				onReorder,
			})
		);

		const initialOrder = result.current.leftItems.map(i => i.id);

		// Trigger reorder
		act(() => {
			void result.current.actions.reorder('item-2', 'item-1');
		});

		// Order changed optimistically
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toEqual(['item-2', 'item-1', 'item-3']);
		});

		// Reject promise (API error)
		act(() => {
			reorderPromise.reject(new Error('Network error'));
		});

		// Order should rollback
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toEqual(initialOrder);
			expect(result.current.reorderingIds.size).toBe(0);
		});
	});

	it('REORDER: should do nothing if onReorder not provided', async () => {
		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate: vi.fn(),
				// No onReorder provided
			})
		);

		const initialOrder = result.current.leftItems.map(i => i.id);

		// Trigger reorder
		act(() => {
			void result.current.actions.reorder('item-2', 'item-1');
		});

		// Nothing should happen
		expect(result.current.leftItems.map(i => i.id)).toEqual(initialOrder);
		expect(result.current.reorderingIds.size).toBe(0);
	});

	it('REORDER: should do nothing if activeId or overId not found', async () => {
		const onReorder = vi.fn();
		const associatedIds = new Set(['item-1', 'item-2']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate: vi.fn(),
				onDissociate: vi.fn(),
				onReorder,
			})
		);

		// Trigger reorder with invalid ID
		act(() => {
			void result.current.actions.reorder('invalid-id', 'item-1');
		});

		// API should not be called
		expect(onReorder).not.toHaveBeenCalled();
	});

	it('CLEAR STATE: should clear all optimistic states when isOpen becomes false', async () => {
		const associatePromise = createControlledPromise<void>();
		const onAssociate = vi.fn().mockReturnValue(associatePromise.promise);

		const associatedIds = new Set(['item-1']);

		const { result, rerender } = renderHook(
			({ isOpen }) =>
				useDualListState({
					allItems: mockItems,
					associatedIds,
					itemKey: item => item.id,
					onAssociate,
					onDissociate: vi.fn(),
					isOpen,
				}),
			{ initialProps: { isOpen: true } }
		);

		// Trigger associate
		act(() => {
			void result.current.actions.associate('item-2');
		});

		// Item moved optimistically, loading state active
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toContain('item-2');
			expect(result.current.loadingItems.has('item-2')).toBe(true);
		});

		// Close dialog
		rerender({ isOpen: false });

		// All optimistic states should be cleared
		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).not.toContain('item-2');
			expect(result.current.loadingItems.size).toBe(0);
		});
	});

	it('EDGE CASE: associate item that was just dissociated (clear opposite state)', async () => {
		const associatePromise = createControlledPromise<void>();
		const dissociatePromise = createControlledPromise<void>();
		const onAssociate = vi.fn().mockReturnValue(associatePromise.promise);
		const onDissociate = vi.fn().mockReturnValue(dissociatePromise.promise);

		const associatedIds = new Set(['item-1']);

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate,
				onDissociate,
			})
		);

		// First dissociate item-1
		act(() => {
			void result.current.actions.dissociate('item-1');
		});

		await waitFor(() => {
			expect(result.current.rightItems.map(i => i.id)).toContain('item-1');
		});

		// Then associate it again (should clear dissociation optimistic state)
		act(() => {
			void result.current.actions.associate('item-1');
		});

		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toContain('item-1');
			expect(result.current.rightItems.map(i => i.id)).not.toContain('item-1');
		});
	});

	it('EDGE CASE: dissociate item that was just associated (clear opposite state)', async () => {
		const associatePromise = createControlledPromise<void>();
		const dissociatePromise = createControlledPromise<void>();
		const onAssociate = vi.fn().mockReturnValue(associatePromise.promise);
		const onDissociate = vi.fn().mockReturnValue(dissociatePromise.promise);

		const associatedIds = new Set<string>();

		const { result } = renderHook(() =>
			useDualListState({
				allItems: mockItems,
				associatedIds,
				itemKey: item => item.id,
				onAssociate,
				onDissociate,
			})
		);

		// First associate item-1
		act(() => {
			void result.current.actions.associate('item-1');
		});

		await waitFor(() => {
			expect(result.current.leftItems.map(i => i.id)).toContain('item-1');
		});

		// Then dissociate it again (should clear association optimistic state)
		act(() => {
			void result.current.actions.dissociate('item-1');
		});

		await waitFor(() => {
			expect(result.current.rightItems.map(i => i.id)).toContain('item-1');
			expect(result.current.leftItems.map(i => i.id)).not.toContain('item-1');
		});
	});
});
