import { useCallback, useRef } from 'react';

import { useMultiSelect } from './useMultiSelect';

/**
 * ===========================================================================================
 * USE TABLE SELECTION - Table-Specific Selection Hook
 * ===========================================================================================
 *
 * Thin wrapper around useMultiSelect that adds Table-specific UI concerns:
 * - Checkbox ref management for indeterminate state
 * - Event handling for React checkbox events (extracting shiftKey)
 *
 * This hook provides backward compatibility with the existing Table component API.
 *
 * ===========================================================================================
 */

export interface UseTableSelectionProps<T> {
	data: T[];
	selectedIds: Set<string>;
	onSelectionChange?: (selectedIds: Set<string>) => void;
	getItemId: (item: T) => string;
}

export interface UseTableSelectionReturn {
	selectAllCheckboxRef: React.RefObject<HTMLButtonElement | null>;
	handleToggleSelection: (id: string, index: number, event: React.ChangeEvent<HTMLInputElement>) => void;
	handleToggleSelectAll: () => void;
	isAllSelected: boolean;
	isSomeSelected: boolean;
}

export function useTableSelection<T>({
	data,
	selectedIds,
	onSelectionChange,
	getItemId,
}: UseTableSelectionProps<T>): UseTableSelectionReturn {
	// Use the generic multi-select hook
	const multiSelect = useMultiSelect({
		items: data,
		getItemId,
		selectedIds,
		onSelectionChange,
	});

	// Ref for the select-all checkbox (used for accessibility/focus management)
	const selectAllCheckboxRef = useRef<HTMLButtonElement>(null);

	// Note: Indeterminate state is managed via the checked="indeterminate" prop
	// passed to the Radix UI Checkbox component, so no manual DOM manipulation needed

	// Wrapper for toggleSelection that extracts shiftKey from React event
	const handleToggleSelection = useCallback(
		(id: string, index: number, event: React.ChangeEvent<HTMLInputElement>) => {
			const shiftKey = event.nativeEvent ? (event.nativeEvent as MouseEvent).shiftKey : false;
			multiSelect.toggleSelection(id, index, { shiftKey });
		},
		[multiSelect]
	);

	return {
		selectAllCheckboxRef,
		handleToggleSelection,
		handleToggleSelectAll: multiSelect.toggleAll,
		isAllSelected: multiSelect.isAllSelected,
		isSomeSelected: multiSelect.isSomeSelected,
	};
}
