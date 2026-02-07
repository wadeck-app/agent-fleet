import { useMemo } from 'react';

import {
	type DragEndEvent,
	KeyboardSensor,
	type PointerActivationConstraint,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * ===========================================================================================
 * USE DRAG AND DROP - Headless Drag & Drop Hook
 * ===========================================================================================
 *
 * Reusable hook for managing drag-and-drop functionality with dnd-kit.
 * Extracts DnD setup logic from components for better testability and reusability.
 *
 * Key features:
 * - Configures sensors (pointer and keyboard) with activation constraints
 * - Generates sortable IDs from items
 * - Handles drag end events and calls reorder callback
 * - Supports disabled state
 * - Memoized for performance
 *
 * Example usage:
 * ```typescript
 * const dnd = useDragAndDrop({
 *   items: myItems,
 *   getItemId: (item, index) => item.id || index,
 *   onReorder: (fromIndex, toIndex) => {
 *     actions.reorder(fromIndex, toIndex);
 *   },
 *   disabled: false,
 *   activationConstraint: { distance: 8 },
 * });
 *
 * // Use in component
 * <DndContext sensors={dnd.sensors} onDragEnd={dnd.handleDragEnd}>
 *   <SortableContext items={dnd.sortableIds}>
 *     ...
 *   </SortableContext>
 * </DndContext>
 * ```
 *
 * ===========================================================================================
 */

export interface UseDragAndDropOptions<T> {
	/** Array of items to make sortable */
	items: T[];
	/** Function to extract unique ID from item */
	getItemId: (item: T, index: number) => string | number;
	/** Callback when items are reordered */
	onReorder: (fromIndex: number, toIndex: number) => void;
	/** Whether drag and drop is disabled */
	disabled?: boolean;
	/** Activation constraint (e.g., minimum drag distance) */
	activationConstraint?: PointerActivationConstraint;
}

export interface UseDragAndDropReturn {
	/** Configured sensors for DndContext */
	sensors: ReturnType<typeof useSensors>;
	/** Drag end handler for DndContext */
	handleDragEnd: (event: DragEndEvent) => void;
	/** Array of sortable IDs for SortableContext */
	sortableIds: (string | number)[];
}

/**
 * Headless drag and drop hook for dnd-kit integration.
 *
 * @param options - Configuration options
 * @returns UseDragAndDropReturn with sensors, handler, and IDs
 */
export function useDragAndDrop<T>(options: UseDragAndDropOptions<T>): UseDragAndDropReturn {
	const { items, getItemId, onReorder, disabled = false, activationConstraint } = options;

	// Setup dnd-kit sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: activationConstraint ?? { distance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Generate sortable IDs from items
	const sortableIds = useMemo(() => items.map((item, index) => getItemId(item, index)), [items, getItemId]);

	// Handle drag end event
	const handleDragEnd = useMemo(() => {
		return (event: DragEndEvent) => {
			if (disabled) {
				return;
			}

			const { active, over } = event;

			if (!over || active.id === over.id) {
				return;
			}

			const fromIndex = sortableIds.indexOf(active.id);
			const toIndex = sortableIds.indexOf(over.id);

			if (fromIndex === -1 || toIndex === -1) {
				return;
			}

			onReorder(fromIndex, toIndex);
		};
	}, [sortableIds, onReorder, disabled]);

	return {
		sensors,
		handleDragEnd,
		sortableIds,
	};
}
