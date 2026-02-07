import type { ReactNode } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandle } from '@framework/components2/primitives/DragHandle';

/**
 * ===========================================================================================
 * SORTABLE ITEM - Drag & Drop Wrapper Component
 * ===========================================================================================
 *
 * Wrapper component that makes items draggable using dnd-kit.
 * Used internally by EditableListField when reordering is enabled.
 *
 * Features:
 * - Drag handle with visual indicator
 * - Transform and transition animations
 * - Disabled state support
 * - Accessible keyboard navigation
 *
 * Example usage:
 * ```typescript
 * <SortableItem id={0} disabled={false}>
 *   <div>My draggable content</div>
 * </SortableItem>
 * ```
 *
 * ===========================================================================================
 */

export interface SortableItemProps {
	/** Unique identifier for the item (usually the array index) */
	id: number | string;
	/** Whether dragging is disabled */
	disabled?: boolean;
	/** Content to render inside the sortable wrapper */
	children: ReactNode;
}

export function SortableItem({ id, disabled = false, children }: SortableItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
		disabled,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} className="relative">
			<div className="flex items-start gap-2">
				{/* Drag Handle */}
				{!disabled && <DragHandle className="mt-2" disabled={disabled} {...attributes} {...listeners} />}

				{/* Content */}
				<div className="flex-1">{children}</div>
			</div>
		</div>
	);
}
