import { useCallback, useEffect, useState } from 'react';

import type { TableColumn } from '@framework/components/table/Table';
import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';

/**
 * ===========================================================================================
 * USE COLUMN ORDER HOOK
 * ===========================================================================================
 *
 * Manages column order state with localStorage persistence.
 *
 * Features:
 * - Reorder columns via drag & drop (activeId/overId)
 * - Reset to default column order
 * - Automatic localStorage persistence
 * - SSR-safe (no errors during server-side rendering)
 * - Handles new columns added to code (appends to end)
 * - Handles removed columns (filters out invalid ones)
 *
 * Usage:
 *   const { columnOrder, reorderColumns, resetOrder, applyOrder } =
 *     useColumnOrder({
 *       storageId: 'books-table',
 *       defaultOrder: ['title', 'author', 'isbn', 'publishedYear'],
 *     });
 *
 * ===========================================================================================
 */

export interface UseColumnOrderOptions {
	/** Unique identifier for persistent state (suffixed with '-column-order') */
	storageId: string;
	/** Default column order (array of column IDs) */
	defaultOrder: string[];
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
}

export interface UseColumnOrderResult {
	/** Array of column IDs in current order */
	columnOrder: string[];
	/** Reorder columns (swap activeId with overId) - used with dnd-kit */
	reorderColumns: (activeId: string, overId: string) => void;
	/** Move column to specific index */
	moveColumn: (columnId: string, newIndex: number) => void;
	/** Reset single column to its default position */
	resetColumn: (columnId: string) => void;
	/** Reset to default order */
	resetOrder: () => void;
	/** Check if current order differs from default */
	isModified: () => boolean;
	/** Check if a specific column is at its default position */
	isColumnModified: (columnId: string) => boolean;
	/** Apply order to columns array (returns reordered array) */
	applyOrder: <T>(columns: TableColumn<T>[]) => TableColumn<T>[];
}

/**
 * Hook for managing column order with localStorage persistence
 *
 * @param options - Configuration options
 * @returns Column order state and controls
 */
export function useColumnOrder(options: UseColumnOrderOptions): UseColumnOrderResult {
	const { storageId, defaultOrder, storage = defaultStorage } = options;
	const storageKey = `${storageId}-column-order`;

	// Load initial state from storage (SSR-safe)
	const loadFromStorage = (): string[] => {
		const stored = storage.get<string[]>(storageKey);

		if (stored && Array.isArray(stored)) {
			// Filter to keep only columns that exist in defaultOrder
			const validColumns = stored.filter((col: string) => defaultOrder.includes(col));

			// Find new columns not in stored order (added to code since last save)
			const newColumns = defaultOrder.filter((col: string) => !stored.includes(col));

			// Return: existing order + new columns appended at end
			return [...validColumns, ...newColumns];
		}

		return defaultOrder;
	};

	const [columnOrder, setColumnOrder] = useState<string[]>(loadFromStorage);

	// Save to storage whenever columnOrder changes
	useEffect(() => {
		storage.set(storageKey, columnOrder);
	}, [columnOrder, storageKey, storage]);

	/**
	 * Reorder columns by swapping activeId with overId
	 * Used with dnd-kit onDragEnd handler
	 */
	const reorderColumns = useCallback((activeId: string, overId: string) => {
		setColumnOrder(prev => {
			const activeIndex = prev.indexOf(activeId);
			const overIndex = prev.indexOf(overId);

			// Invalid indices, no-op
			if (activeIndex === -1 || overIndex === -1) return prev;

			// Same position, no-op
			if (activeIndex === overIndex) return prev;

			// Create new array with swapped elements
			const next = [...prev];
			next.splice(activeIndex, 1);
			next.splice(overIndex, 0, activeId);

			return next;
		});
	}, []);

	/**
	 * Move column to specific index
	 */
	const moveColumn = useCallback((columnId: string, newIndex: number) => {
		setColumnOrder(prev => {
			const currentIndex = prev.indexOf(columnId);

			// Invalid index, no-op
			if (currentIndex === -1) return prev;

			// Same position, no-op
			if (currentIndex === newIndex) return prev;

			// Clamp newIndex to valid range
			const clampedIndex = Math.max(0, Math.min(newIndex, prev.length - 1));

			// Create new array with moved element
			const next = [...prev];
			next.splice(currentIndex, 1);
			next.splice(clampedIndex, 0, columnId);

			return next;
		});
	}, []);

	/**
	 * Reset single column to its default position
	 */
	const resetColumn = useCallback(
		(columnId: string) => {
			const defaultIndex = defaultOrder.indexOf(columnId);
			if (defaultIndex !== -1) {
				moveColumn(columnId, defaultIndex);
			}
		},
		[defaultOrder, moveColumn]
	);

	/**
	 * Reset to default column order
	 */
	const resetOrder = useCallback(() => {
		setColumnOrder([...defaultOrder]);
	}, [defaultOrder]);

	/**
	 * Check if current order differs from default
	 */
	const isModified = useCallback((): boolean => {
		if (columnOrder.length !== defaultOrder.length) return true;

		return columnOrder.some((id, index) => id !== defaultOrder[index]);
	}, [columnOrder, defaultOrder]);

	/**
	 * Check if a specific column is at its default position
	 */
	const isColumnModified = useCallback(
		(columnId: string): boolean => {
			const currentIndex = columnOrder.indexOf(columnId);
			const defaultIndex = defaultOrder.indexOf(columnId);

			// Column not found in either array
			if (currentIndex === -1 || defaultIndex === -1) return false;

			// Compare positions
			return currentIndex !== defaultIndex;
		},
		[columnOrder, defaultOrder]
	);

	/**
	 * Apply current column order to an array of columns
	 * Returns a new array with columns reordered according to columnOrder
	 *
	 * Handles:
	 * - Columns in columnOrder but not in input array (ignored)
	 * - Columns in input array but not in columnOrder (appended at end)
	 */
	const applyOrder = useCallback(
		<T>(columns: TableColumn<T>[]): TableColumn<T>[] => {
			// Create map for fast lookup
			const columnMap = new Map(columns.map(col => [col.key, col]));

			// Build ordered array based on columnOrder
			const orderedColumns: TableColumn<T>[] = [];

			for (const key of columnOrder) {
				const column = columnMap.get(key);
				if (column) {
					orderedColumns.push(column);
					columnMap.delete(key); // Remove from map
				}
			}

			// Append any columns not in columnOrder (new columns added to code)
			const remainingColumns = Array.from(columnMap.values());

			return [...orderedColumns, ...remainingColumns];
		},
		[columnOrder]
	);

	return {
		columnOrder,
		reorderColumns,
		moveColumn,
		resetColumn,
		resetOrder,
		isModified,
		isColumnModified,
		applyOrder,
	};
}
