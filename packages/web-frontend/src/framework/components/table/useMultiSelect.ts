import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * ===========================================================================================
 * USE MULTI SELECT - Generic Multi-Item Selection Hook
 * ===========================================================================================
 *
 * Generic hook for managing multi-item selection across any UI component (Table, Grid, List, etc.)
 * Completely UI-agnostic - no dependencies on specific components.
 *
 * Features:
 * - Single and multi-selection modes
 * - Range selection with Shift+Click
 * - Select all/deselect all
 * - Indeterminate state support
 * - Cross-page selection persistence (via parent state)
 * - Controlled component pattern
 *
 * Example usage:
 * ```typescript
 * // In a page component
 * const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 *
 * const selection = useMultiSelect({
 *   items: books,
 *   getItemId: (book) => book.id,
 *   selectedIds,
 *   onSelectionChange: setSelectedIds,
 * });
 *
 * // Use in UI
 * <Checkbox checked={selection.isSelected(book.id)} />
 * <Button onClick={selection.toggleAll}>Select All</Button>
 * ```
 *
 * ===========================================================================================
 */

export interface UseMultiSelectOptions<T> {
	/** Array of items in current view (e.g., current page) */
	items: T[];

	/** Function to extract unique ID from item */
	getItemId: (item: T) => string;

	/** Currently selected IDs (controlled) */
	selectedIds?: Set<string>;

	/** Callback when selection changes (controlled) */
	onSelectionChange?: (selectedIds: Set<string>) => void;

	/** Selection mode: 'single' allows only one selection, 'multi' allows multiple */
	mode?: 'single' | 'multi';
}

export interface UseMultiSelectResult {
	// State
	/** Set of currently selected IDs */
	selectedIds: Set<string>;

	/** Check if specific ID is selected */
	isSelected: (id: string) => boolean;

	/** All items in current view are selected */
	isAllSelected: boolean;

	/** Some but not all items are selected (indeterminate state) */
	isSomeSelected: boolean;

	/** Number of selected items */
	selectedCount: number;

	// Actions
	/** Toggle selection of a single item with optional range selection */
	toggleSelection: (id: string, index: number, options?: ToggleOptions) => void;

	/** Toggle between select all and deselect all */
	toggleAll: () => void;

	/** Select all items in current view */
	selectAll: () => void;

	/** Deselect all items */
	deselectAll: () => void;

	/** Set selected IDs directly */
	setSelectedIds: (ids: Set<string>) => void;
}

export interface ToggleOptions {
	/** Shift key pressed (for range selection) */
	shiftKey?: boolean;

	/** Force select or deselect (ignore toggle) */
	force?: 'select' | 'deselect';
}

export function useMultiSelect<T>({
	items,
	getItemId,
	selectedIds: controlledSelectedIds,
	onSelectionChange,
	mode = 'multi',
}: UseMultiSelectOptions<T>): UseMultiSelectResult {
	// Internal state for uncontrolled mode
	const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

	// Determine if controlled or uncontrolled
	const isControlled = controlledSelectedIds !== undefined;
	const selectedIds = isControlled ? controlledSelectedIds : internalSelectedIds;

	// Track the last selected index for shift+click range selection (anchor point)
	const lastSelectedIndexRef = useRef<number | null>(null);
	// Track the last range end for shift+click (for Gmail-like deselection behavior)
	const lastRangeEndRef = useRef<number | null>(null);

	// Utility: Update selection (handles both controlled and uncontrolled)
	const updateSelection = useCallback(
		(newSelection: Set<string>) => {
			if (isControlled) {
				onSelectionChange?.(newSelection);
			} else {
				setInternalSelectedIds(newSelection);
			}
		},
		[isControlled, onSelectionChange]
	);

	// Check if a specific ID is selected
	const isSelected = useCallback(
		(id: string): boolean => {
			return selectedIds.has(id);
		},
		[selectedIds]
	);

	// Compute selection state
	const isAllSelected = useMemo(() => {
		return (
			items.length > 0 &&
			selectedIds.size >= items.length &&
			items.every(item => selectedIds.has(getItemId(item)))
		);
	}, [items, selectedIds, getItemId]);

	const isSomeSelected = useMemo(() => {
		const visibleSelected = items.filter(item => selectedIds.has(getItemId(item))).length;
		return visibleSelected > 0 && visibleSelected < items.length;
	}, [items, selectedIds, getItemId]);

	const selectedCount = selectedIds.size;

	// Toggle selection of a single item
	const toggleSelection = useCallback(
		(id: string, index: number, options?: ToggleOptions) => {
			const { shiftKey = false, force } = options || {};

			if (mode === 'single') {
				// Single mode: deselect others
				if (force === 'deselect' || (selectedIds.has(id) && force !== 'select')) {
					updateSelection(new Set());
					lastSelectedIndexRef.current = null;
				} else {
					updateSelection(new Set([id]));
					lastSelectedIndexRef.current = index;
				}
				return;
			}

			// Multi mode with range selection
			if (shiftKey && lastSelectedIndexRef.current !== null) {
				// Shift+Click: select or deselect range (Gmail-like behavior)
				const anchor = lastSelectedIndexRef.current;
				const start = Math.min(anchor, index);
				const end = Math.max(anchor, index);

				// Collect all IDs in range
				const rangeIds: string[] = [];
				for (let i = start; i <= end; i++) {
					const item = items[i];
					if (item) {
						rangeIds.push(getItemId(item));
					}
				}

				// Check if ALL items in the range are already selected
				const allSelected = rangeIds.every(rangeId => selectedIds.has(rangeId));

				const next = new Set(selectedIds);
				if (allSelected) {
					// All selected → deselecting behavior
					// Check if we're "shrinking" an existing range (Gmail behavior)
					const lastRangeEnd = lastRangeEndRef.current;

					if (
						lastRangeEnd !== null &&
						((index > anchor && index < lastRangeEnd) || // Shrinking forward range
							(index < anchor && index > lastRangeEnd)) // Shrinking backward range
					) {
						// Gmail-like shrinking: keep range from anchor toward click
						// Forward (anchor < lastRangeEnd): keep [anchor, click-1], deselect [click, lastRangeEnd]
						// Backward (anchor > lastRangeEnd): keep [click, anchor], deselect [lastRangeEnd, click-1]
						if (anchor < lastRangeEnd) {
							// Forward range: deselect [click, lastRangeEnd]
							for (let i = index; i <= lastRangeEnd; i++) {
								const item = items[i];
								if (item) {
									next.delete(getItemId(item));
								}
							}
							// lastRangeEnd becomes click-1 (excluded)
							lastRangeEndRef.current = index - 1;
						} else {
							// Backward range: deselect [lastRangeEnd, click-1]
							for (let i = lastRangeEnd; i < index; i++) {
								const item = items[i];
								if (item) {
									next.delete(getItemId(item));
								}
							}
							// lastRangeEnd becomes click (included)
							lastRangeEndRef.current = index;
						}
					} else {
						// Normal deselection: deselect the range
						rangeIds.forEach(rangeId => next.delete(rangeId));
						lastRangeEndRef.current = null;
					}
				} else {
					// Select the range
					rangeIds.forEach(rangeId => next.add(rangeId));
					// Remember this end for potential shrinking
					lastRangeEndRef.current = index;
				}
				updateSelection(next);
				// Don't update lastSelectedIndexRef on Shift+Click to maintain the anchor point
			} else {
				// Normal click: toggle single item
				const next = new Set(selectedIds);

				if (force === 'select') {
					next.add(id);
				} else if (force === 'deselect') {
					next.delete(id);
				} else {
					// Toggle
					if (next.has(id)) {
						next.delete(id);
					} else {
						next.add(id);
					}
				}

				updateSelection(next);
				lastSelectedIndexRef.current = index;
				lastRangeEndRef.current = null; // Reset range end on normal click
			}
		},
		[items, selectedIds, updateSelection, getItemId, mode]
	);

	// Toggle all items in current view
	const toggleAll = useCallback(() => {
		// If any items are selected, deselect all. Otherwise, select all.
		if (selectedIds.size > 0) {
			updateSelection(new Set());
		} else {
			updateSelection(new Set(items.map(getItemId)));
		}
		lastSelectedIndexRef.current = null;
		lastRangeEndRef.current = null;
	}, [items, selectedIds, updateSelection, getItemId]);

	// Select all items in current view
	const selectAll = useCallback(() => {
		updateSelection(new Set(items.map(getItemId)));
		lastSelectedIndexRef.current = null;
		lastRangeEndRef.current = null;
	}, [items, updateSelection, getItemId]);

	// Deselect all items
	const deselectAll = useCallback(() => {
		updateSelection(new Set());
		lastSelectedIndexRef.current = null;
		lastRangeEndRef.current = null;
	}, [updateSelection]);

	// Set selected IDs directly
	const setSelectedIds = useCallback(
		(ids: Set<string>) => {
			updateSelection(ids);
			lastSelectedIndexRef.current = null;
			lastRangeEndRef.current = null;
		},
		[updateSelection]
	);

	return {
		selectedIds,
		isSelected,
		isAllSelected,
		isSomeSelected,
		selectedCount,
		toggleSelection,
		toggleAll,
		selectAll,
		deselectAll,
		setSelectedIds,
	};
}
