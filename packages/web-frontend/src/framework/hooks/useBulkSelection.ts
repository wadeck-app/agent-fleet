import { useCallback, useState } from 'react';

/**
 * ===========================================================================================
 * USE BULK SELECTION - Bulk Selection State Management Hook
 * ===========================================================================================
 *
 * Manages multi-item selection state with common operations.
 * - Set-based selection for efficient lookups
 * - Helper methods for common selection operations
 * - Session-based persistence (not localStorage)
 * - Type-safe with full TypeScript support
 *
 * Problem Solved:
 * Managing bulk selection state requires repetitive Set operations and state updates.
 * This hook provides a clean API for common selection patterns used in tables and lists.
 *
 * Example usage:
 * ```typescript
 * // Before: Manual Set operations
 * const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 * const clearSelection = () => setSelectedIds(new Set());
 * const selectAll = (ids: string[]) => setSelectedIds(new Set(ids));
 * const toggleSelection = (id: string) => {
 *   setSelectedIds(prev => {
 *     const next = new Set(prev);
 *     if (next.has(id)) {
 *       next.delete(id);
 *     } else {
 *       next.add(id);
 *     }
 *     return next;
 *   });
 * };
 *
 * // After: Clean API
 * const selection = useBulkSelection();
 * selection.clearSelection();
 * selection.selectAll(bookIds);
 * selection.toggleSelection('123');
 * ```
 *
 * ===========================================================================================
 */

export interface UseBulkSelectionResult {
	/**
	 * Set of currently selected IDs
	 */
	selectedIds: Set<string>;

	/**
	 * Function to set the selected IDs (replaces entire selection)
	 */
	setSelectedIds: (ids: Set<string>) => void;

	/**
	 * Clears all selections
	 */
	clearSelection: () => void;

	/**
	 * Selects all provided IDs (replaces current selection)
	 */
	selectAll: (ids: string[]) => void;

	/**
	 * Toggles selection for a single ID (add if not present, remove if present)
	 */
	toggleSelection: (id: string) => void;

	/**
	 * Checks if an ID is currently selected
	 */
	isSelected: (id: string) => boolean;
}

/**
 * Hook that manages bulk selection state with common operations
 *
 * @returns Object containing selection state and helper methods
 *
 * @example
 * ```typescript
 * // In BooksPage
 * const {
 *   selectedIds,
 *   clearSelection,
 *   selectAll,
 *   toggleSelection,
 *   isSelected
 * } = useBulkSelection();
 *
 * // Select all books
 * <Button onClick={() => selectAll(books.map(b => b.id))}>
 *   Select All
 * </Button>
 *
 * // Toggle individual book
 * <Checkbox
 *   checked={isSelected(book.id)}
 *   onCheckedChange={() => toggleSelection(book.id)}
 * />
 *
 * // Clear selection
 * <Button onClick={clearSelection}>Clear</Button>
 * ```
 */
export function useBulkSelection(): UseBulkSelectionResult {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	const selectAll = useCallback((ids: string[]) => {
		setSelectedIds(new Set(ids));
	}, []);

	const toggleSelection = useCallback((id: string) => {
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const isSelected = useCallback(
		(id: string) => {
			return selectedIds.has(id);
		},
		[selectedIds]
	);

	return {
		selectedIds,
		setSelectedIds,
		clearSelection,
		selectAll,
		toggleSelection,
		isSelected,
	};
}
