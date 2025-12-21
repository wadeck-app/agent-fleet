import { useCallback, useEffect, useMemo, useState } from 'react';

import { defaultStorage } from '@framework/storage/LocalStorageAdapter';
import type { StorageAdapter } from '@framework/storage/StorageAdapter';

/**
 * ===========================================================================================
 * USE COLUMN VISIBILITY HOOK
 * ===========================================================================================
 *
 * Manages column visibility state with localStorage persistence.
 *
 * Features:
 * - Toggle individual column visibility
 * - Reset to default columns
 * - Show/hide all columns
 * - Automatic localStorage persistence
 * - SSR-safe (no errors during server-side rendering)
 *
 * Usage:
 *   const { visibleColumns, toggleColumn, resetColumns, showAll, hideAll } =
 *     useColumnVisibility(['id', 'name', 'email'], { storageId: 'users-table' });
 *
 * ===========================================================================================
 */

export interface UseColumnVisibilityOptions {
	/** Unique identifier for persistent state (suffixed with '-column-visibility') */
	storageId: string;
	/** Default visible columns (all columns if not specified) */
	defaultVisible?: string[];
	/** Storage adapter to use (defaults to localStorage) */
	storage?: StorageAdapter;
	/** Column constraints (e.g., canHide) - maps column IDs to their constraints */
	constraints?: Record<string, { canHide: boolean }>;
}

export interface UseColumnVisibilityResult {
	/** Set of currently visible column IDs */
	visibleColumns: Set<string>;
	/** Check if a column is visible */
	isColumnVisible: (columnId: string) => boolean;
	/** Toggle a column's visibility */
	toggleColumn: (columnId: string) => void;
	/** Show a column */
	showColumn: (columnId: string) => void;
	/** Hide a column */
	hideColumn: (columnId: string) => void;
	/** Reset to default columns */
	resetColumns: () => void;
	/** Show all columns */
	showAll: () => void;
	/** Hide all columns */
	hideAll: () => void;
	/** Get visibility state as object (for external use) */
	getVisibilityState: () => Record<string, boolean>;
	/** Check if a column's visibility differs from default */
	isColumnModified: (columnId: string) => boolean;
	/** Reset a single column to its default visibility */
	resetColumn: (columnId: string) => void;
}

/**
 * Hook for managing column visibility with localStorage persistence
 *
 * @param allColumns - Array of all possible column IDs
 * @param options - Configuration options
 * @returns Column visibility state and controls
 */
export function useColumnVisibility(
	allColumns: string[],
	options: UseColumnVisibilityOptions
): UseColumnVisibilityResult {
	const { storageId, defaultVisible, storage = defaultStorage, constraints } = options;
	const storageKey = `${storageId}-column-visibility`;

	// Default to all columns visible if not specified
	// useMemo to prevent object construction on every render
	const defaultVisibleSet = useMemo(() => new Set(defaultVisible ?? allColumns), [defaultVisible, allColumns]);

	// Load initial state from storage (SSR-safe)
	const loadFromStorage = (): Set<string> => {
		const stored = storage.get<string[]>(storageKey);

		if (stored && Array.isArray(stored)) {
			// Validate that stored columns exist in allColumns
			const validColumns = stored.filter((col: string) => allColumns.includes(col));
			return new Set(validColumns);
		}

		return defaultVisibleSet;
	};

	const [visibleColumns, setVisibleColumns] = useState<Set<string>>(loadFromStorage);

	// Save to storage whenever visibleColumns changes
	useEffect(() => {
		const columnsArray = Array.from(visibleColumns);
		storage.set(storageKey, columnsArray);
	}, [visibleColumns, storageKey, storage]);

	// Helper: Check if a column can be hidden based on constraints
	const canHideColumn = useCallback(
		(columnId: string): boolean => {
			if (!constraints || !constraints[columnId]) {
				return true; // No constraints means column can be hidden
			}
			return constraints[columnId].canHide;
		},
		[constraints]
	);

	const isColumnVisible = useCallback(
		(columnId: string): boolean => {
			return visibleColumns.has(columnId);
		},
		[visibleColumns]
	);

	const toggleColumn = useCallback(
		(columnId: string) => {
			setVisibleColumns(prev => {
				const next = new Set(prev);
				if (next.has(columnId)) {
					// Check if column can be hidden before hiding it
					if (!canHideColumn(columnId)) {
						return prev; // Don't hide if constrained
					}
					next.delete(columnId);
				} else {
					next.add(columnId);
				}
				return next;
			});
		},
		[canHideColumn]
	);

	const showColumn = useCallback((columnId: string) => {
		setVisibleColumns(prev => new Set(prev).add(columnId));
	}, []);

	const hideColumn = useCallback(
		(columnId: string) => {
			// Check if column can be hidden before hiding it
			if (!canHideColumn(columnId)) {
				return; // Don't hide if constrained
			}
			setVisibleColumns(prev => {
				const next = new Set(prev);
				next.delete(columnId);
				return next;
			});
		},
		[canHideColumn]
	);

	const resetColumns = useCallback(() => {
		setVisibleColumns(new Set(defaultVisibleSet));
	}, [defaultVisibleSet]);

	const showAll = useCallback(() => {
		setVisibleColumns(new Set(allColumns));
	}, [allColumns]);

	const hideAll = useCallback(() => {
		// Keep columns that cannot be hidden
		if (constraints) {
			const mustStayVisible = allColumns.filter(col => !canHideColumn(col));
			setVisibleColumns(new Set(mustStayVisible));
		} else {
			setVisibleColumns(new Set());
		}
	}, [constraints, allColumns, canHideColumn]);

	const getVisibilityState = useCallback((): Record<string, boolean> => {
		return Object.fromEntries(allColumns.map(col => [col, visibleColumns.has(col)]));
	}, [allColumns, visibleColumns]);

	// @formatter:off
	/**
	 * Check if a column's visibility differs from its default state
	 */
	const isColumnModified = useCallback(
		(columnId: string): boolean => {
			const isCurrentlyVisible = visibleColumns.has(columnId);
			const isDefaultVisible = defaultVisibleSet.has(columnId);
			return isCurrentlyVisible !== isDefaultVisible;
		},
		[visibleColumns, defaultVisibleSet]
	);

	/**
	 * Reset a single column to its default visibility state
	 */
	const resetColumn = useCallback(
		(columnId: string) => {
			const shouldBeVisible = defaultVisibleSet.has(columnId);
			if (shouldBeVisible && !visibleColumns.has(columnId)) {
				showColumn(columnId);
			} else if (!shouldBeVisible && visibleColumns.has(columnId)) {
				hideColumn(columnId);
			}
		},
		[defaultVisibleSet, visibleColumns, showColumn, hideColumn]
	);
	// @formatter:on

	return {
		visibleColumns,
		isColumnVisible,
		toggleColumn,
		showColumn,
		hideColumn,
		resetColumns,
		showAll,
		hideAll,
		getVisibilityState,
		isColumnModified,
		resetColumn,
	};
}
