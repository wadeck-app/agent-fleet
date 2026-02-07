import { useCallback, useMemo, useState } from 'react';

import type { FeatureContract } from '@framework/types/FeatureContract';

/**
 * ===========================================================================================
 * USE MULTI SELECT2 - Headless Multi-Selection Hook
 * ===========================================================================================
 *
 * Multi-selection feature hook following the headless composable pattern.
 * Manages selection state for tables, grids, and other list components.
 *
 * Key features:
 * - Returns standardized FeatureContract: { fstate, actions, fillQuery }
 * - Manages Set<string> of selected IDs
 * - No persistence between page refreshes (in-memory only)
 * - Persists across pagination (session-scoped)
 * - Toggle individual items, select all, clear all
 * - No query parameters (selection is UI-only state)
 *
 * Usage:
 * ```typescript
 * const selection = useMultiSelect2();
 *
 * // Access state
 * console.log(selection.fstate.selectedIds); // Set<string>
 * console.log(selection.fstate.count); // number
 * console.log(selection.fstate.isEmpty); // boolean
 *
 * // Call actions
 * selection.actions.toggle('id-123');
 * selection.actions.selectAll(['id-1', 'id-2', 'id-3']);
 * selection.actions.clear();
 * selection.actions.set(new Set(['id-1', 'id-2']));
 * selection.actions.isSelected('id-123'); // boolean
 *
 * // Use in Data2 shell
 * <Data2 selection={selection} ...>
 *   <Table2 />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */

/**
 * State shape for multi-selection feature.
 */
export interface MultiSelectState {
	/** Set of selected item IDs */
	selectedIds: Set<string>;
	/** Number of selected items */
	count: number;
	/** Whether no items are selected */
	isEmpty: boolean;
}

/**
 * Actions for multi-selection feature.
 */
export interface MultiSelectActions extends Record<string, (...args: any[]) => any> {
	/** Toggle selection for a single item */
	toggle: (id: string) => void;
	/** Select all items (replaces current selection) */
	selectAll: (ids: string[]) => void;
	/** Clear all selections */
	clear: () => void;
	/** Set selection to specific IDs (replaces current selection) */
	set: (ids: Set<string>) => void;
	/** Check if an item is selected */
	isSelected: (id: string) => boolean;
}

/**
 * Contract for multi-selection feature.
 */
export type MultiSelectContract = FeatureContract<MultiSelectState> & {
	actions: MultiSelectActions;
};

/**
 * Headless multi-selection hook following the FeatureContract pattern.
 *
 * Persistence Strategy:
 * - In-memory only (no localStorage, no URL params)
 * - Persists across pagination during the session
 * - Resets on page refresh
 *
 * @returns MultiSelectContract with fstate, actions, fillQuery
 */
export function useMultiSelect2(): MultiSelectContract {
	// Local state for selected IDs
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// Frozen state (memoized for stable references)
	const fstate = useMemo<MultiSelectState>(
		() => ({
			selectedIds,
			count: selectedIds.size,
			isEmpty: selectedIds.size === 0,
		}),
		[selectedIds]
	);

	// Actions (all state-modifying functions)
	const actions = useMemo<MultiSelectActions>(
		() => ({
			/**
			 * Toggle selection for a single item.
			 * If selected, removes it. If not selected, adds it.
			 */
			toggle: (id: string) => {
				setSelectedIds(prev => {
					const next = new Set(prev);
					if (next.has(id)) {
						next.delete(id);
					} else {
						next.add(id);
					}
					return next;
				});
			},

			/**
			 * Select all items from the provided list.
			 * Replaces current selection.
			 */
			selectAll: (ids: string[]) => {
				setSelectedIds(new Set(ids));
			},

			/**
			 * Clear all selections.
			 */
			clear: () => {
				setSelectedIds(new Set());
			},

			/**
			 * Set selection to specific IDs.
			 * Replaces current selection.
			 */
			set: (ids: Set<string>) => {
				setSelectedIds(new Set(ids));
			},

			/**
			 * Check if an item is selected.
			 */
			isSelected: (id: string) => {
				return selectedIds.has(id);
			},
		}),
		[selectedIds]
	);

	/**
	 * Fill backend query parameters.
	 * Multi-selection does NOT contribute to backend query.
	 * Selection is UI-only state.
	 */
	const fillQuery = useCallback(() => {
		// No-op: selection doesn't affect backend query
	}, []);

	return {
		fstate,
		actions,
		fillQuery,
	} satisfies MultiSelectContract;
}
