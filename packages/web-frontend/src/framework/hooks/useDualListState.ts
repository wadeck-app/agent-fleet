import { useEffect, useState } from 'react';

/**
 * ===========================================================================================
 * DUAL LIST STATE HOOK (HEADLESS)
 * ===========================================================================================
 *
 * Pure logic hook for managing dual-list state with optimistic updates.
 * This hook is completely UI-agnostic and focuses solely on state management.
 *
 * Responsibilities:
 * - Track loading states (individual items)
 * - Track reordering states (all items in left panel)
 * - Manage optimistic associations/dissociations
 * - Manage optimistic reordering
 * - Calculate effective items (base + optimistic)
 * - Wrap actions with optimistic update logic + error rollback
 *
 * Benefits:
 * - 100% testable with controlled promises (no UI needed)
 * - Reusable across different UI implementations (Dialog, Grid, Table, etc.)
 * - Clear separation of concerns (logic vs presentation)
 * - Easy to debug (all state exposed)
 *
 * Usage:
 *   const state = useDualListState({
 *     allItems: projects,
 *     associatedIds: new Set(pinnedIds),
 *     itemKey: p => p.id,
 *     onAssociate: handlePin,
 *     onDissociate: handleUnpin,
 *     onReorder: handleReorder,
 *   });
 *
 *   // state.leftItems - items in left panel (associated + optimistic)
 *   // state.rightItems - items in right panel (available)
 *   // state.loadingItems - Set of item IDs currently loading
 *   // state.reorderingIds - Set of item IDs currently reordering
 *   // state.actions.associate(id) - move item to left (with optimistic update)
 *   // state.actions.dissociate(id) - move item to right (with optimistic update)
 *   // state.actions.reorder(activeId, overId) - reorder items in left panel
 *
 * ===========================================================================================
 */

export interface UseDualListStateProps<T> {
	/** All available items */
	allItems: T[];
	/** IDs of items currently associated (left panel) - base state from server */
	associatedIds: Set<string>;
	/** Extract unique key from item */
	itemKey: (item: T) => string;

	/** Callback to associate an item (move from right to left) */
	onAssociate: (itemId: string) => Promise<void>;
	/** Callback to dissociate an item (move from left to right) */
	onDissociate: (itemId: string) => Promise<void>;
	/** Callback to reorder items in left panel (optional) */
	onReorder?: (activeId: string, overId: string) => Promise<void>;

	/** Whether the dialog/component is open - used to clear optimistic state on close */
	isOpen?: boolean;
}

export interface UseDualListStateReturn<T> {
	/** Items in left panel (associated + optimistic) */
	leftItems: T[];
	/** Items in right panel (available = not associated) */
	rightItems: T[];

	/** Set of item IDs currently loading (during API call) */
	loadingItems: Set<string>;
	/** Set of item IDs currently reordering (during reorder API call) */
	reorderingIds: Set<string>;

	/** Actions wrapped with optimistic update logic */
	actions: {
		/** Associate an item (move from right to left) */
		associate: (itemId: string) => Promise<void>;
		/** Dissociate an item (move from left to right) */
		dissociate: (itemId: string) => Promise<void>;
		/** Reorder items in left panel */
		reorder: (activeId: string, overId: string) => Promise<void>;
	};
}

export function useDualListState<T>({
	allItems,
	associatedIds,
	itemKey,
	onAssociate,
	onDissociate,
	onReorder,
	isOpen = true,
}: UseDualListStateProps<T>): UseDualListStateReturn<T> {
	// =========================================================================
	// STATE
	// =========================================================================

	// Loading states (individual items)
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

	// Optimistic states (local user intent, not yet confirmed by server)
	const [optimisticAssociations, setOptimisticAssociations] = useState<Set<string>>(new Set());
	const [optimisticDissociations, setOptimisticDissociations] = useState<Set<string>>(new Set());
	const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

	// =========================================================================
	// EFFECTS
	// =========================================================================

	// Clear all optimistic states when dialog/component closes
	useEffect(() => {
		if (!isOpen) {
			setOptimisticAssociations(new Set());
			setOptimisticDissociations(new Set());
			setOptimisticOrder(null);
			setLoadingItems(new Set());
			setReorderingIds(new Set());
		}
	}, [isOpen]);

	// =========================================================================
	// COMPUTED STATE
	// =========================================================================

	// Calculate effective associated IDs (base + optimistic)
	const effectiveAssociatedIds = new Set(associatedIds);
	optimisticAssociations.forEach(id => effectiveAssociatedIds.add(id));
	optimisticDissociations.forEach(id => effectiveAssociatedIds.delete(id));

	// Build left panel items (associated)
	let leftItems = allItems.filter(item => effectiveAssociatedIds.has(itemKey(item)));

	// Apply optimistic reordering if present
	if (optimisticOrder) {
		const orderMap = new Map(optimisticOrder.map((id, index) => [id, index]));
		leftItems = leftItems.sort((a, b) => {
			const orderA = orderMap.get(itemKey(a)) ?? Infinity;
			const orderB = orderMap.get(itemKey(b)) ?? Infinity;
			return orderA - orderB;
		});
	}

	// Build right panel items (available = not associated)
	const rightItems = allItems.filter(item => !effectiveAssociatedIds.has(itemKey(item)));

	// =========================================================================
	// ACTIONS
	// =========================================================================

	// Handle associate (right → left)
	const handleAssociate = async (itemId: string) => {
		// 1. Optimistic update: move immediately
		setOptimisticAssociations(prev => new Set(prev).add(itemId));
		// Clear opposite state if present
		setOptimisticDissociations(prev => {
			if (prev.has(itemId)) {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(itemId));

		try {
			// 2. API call
			await onAssociate(itemId);
			// 3. Success: keep optimistic state until props sync
		} catch (error) {
			// 4. Error: rollback
			console.error('Failed to associate item:', error);
			setOptimisticAssociations(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		} finally {
			// Clear loading state
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		}
	};

	// Handle dissociate (left → right)
	const handleDissociate = async (itemId: string) => {
		// 1. Optimistic update: move immediately
		setOptimisticDissociations(prev => new Set(prev).add(itemId));
		// Clear opposite state if present
		setOptimisticAssociations(prev => {
			if (prev.has(itemId)) {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(itemId));

		try {
			// 2. API call
			await onDissociate(itemId);
			// 3. Success: keep optimistic state until props sync
		} catch (error) {
			// 4. Error: rollback
			console.error('Failed to dissociate item:', error);
			setOptimisticDissociations(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		} finally {
			// Clear loading state
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		}
	};

	// Handle reorder
	const handleReorder = async (activeId: string, overId: string) => {
		if (!onReorder) return;

		// Calculate new order optimistically
		const currentOrder = leftItems.map(item => itemKey(item));
		const activeIndex = currentOrder.indexOf(activeId);
		const overIndex = currentOrder.indexOf(overId);

		if (activeIndex === -1 || overIndex === -1) return;

		// Reorder the array
		const newOrder = [...currentOrder];
		newOrder.splice(activeIndex, 1);
		newOrder.splice(overIndex, 0, activeId);

		// Apply optimistic reordering
		setOptimisticOrder(newOrder);

		// Mark all left items as reordering
		const allLeftIds = new Set(leftItems.map(item => itemKey(item)));
		setReorderingIds(allLeftIds);

		try {
			// API call
			await onReorder(activeId, overId);
			// Success: keep optimistic order until props sync
		} catch (error) {
			// Error: rollback
			console.error('Failed to reorder items:', error);
			setOptimisticOrder(null);
		} finally {
			// Clear reordering state
			setReorderingIds(new Set());
		}
	};

	// =========================================================================
	// RETURN
	// =========================================================================

	return {
		leftItems,
		rightItems,
		loadingItems,
		reorderingIds,
		actions: {
			associate: handleAssociate,
			dissociate: handleDissociate,
			reorder: handleReorder,
		},
	};
}
