import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Circle, GripVertical, Undo2 } from 'lucide-react';

import type { ColumnDef } from './ColumnVisibility';

/**
 * ===========================================================================================
 * SORTABLE COLUMN ITEM COMPONENT
 * ===========================================================================================
 *
 * Draggable column item for ColumnVisibility dropdown.
 *
 * Features:
 * - Drag handle with visual feedback
 * - Checkbox for visibility toggle
 * - Modified indicator for non-default state
 * - Individual reset button
 * - Touch-friendly (supports dnd-kit touch sensors)
 *
 * Usage:
 *   <SortableColumnItem
 *     column={{ id: 'email', label: 'Email' }}
 *     isVisible={true}
 *     isModified={false}
 *     onToggle={() => toggleColumn('email')}
 *     onResetColumn={() => resetColumn('email')}
 *   />
 *
 * ===========================================================================================
 */

export interface SortableColumnItemProps {
	/** Column definition */
	column: ColumnDef;
	/** Whether column is currently visible */
	isVisible: boolean;
	/** Whether column state differs from default (visibility OR order) */
	isModified: boolean;
	/** Whether this column can be hidden (default: true) */
	canHide?: boolean;
	/** Whether this column can be reordered (default: true) */
	canReorder?: boolean;
	/** Callback when checkbox is toggled */
	onToggle: () => void;
	/** Callback to reset column to default state */
	onResetColumn: () => void;
}

export function SortableColumnItem({
	column,
	isVisible,
	isModified,
	canHide = true,
	canReorder = true,
	onToggle,
	onResetColumn,
}: SortableColumnItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: column.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const isDisabled = !canHide && isVisible;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				`
      flex items-center gap-1 rounded-sm
      hover:bg-accent
    `,
				isDisabled && 'opacity-50',
				isDragging && 'z-50'
			)}
		>
			{/* Drag Handle */}
			{/* eslint-disable-next-line no-restricted-syntax */}
			<button
				{...attributes}
				{...(canReorder ? listeners : {})}
				className={cn(
					canReorder
						? `
        cursor-grab touch-none p-2 opacity-40
        hover:opacity-70
        active:cursor-grabbing
      `
						: `cursor-not-allowed p-2 opacity-20`,
					'transition-opacity duration-150'
				)}
				aria-label={`Reorder ${column.label}`}
				title={canReorder ? 'Drag to reorder' : 'This column cannot be reordered'}
				disabled={!canReorder}
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* Checkbox + Label */}
			{/* eslint-disable-next-line no-restricted-syntax */}
			<label
				className={cn(
					'flex flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm',
					isDisabled && 'cursor-not-allowed'
				)}
				title={
					isDisabled
						? 'This column cannot be hidden'
						: isVisible
							? `Hide ${column.label}`
							: `Show ${column.label}`
				}
			>
				<Checkbox checked={isVisible} onCheckedChange={onToggle} disabled={isDisabled} />
				<span className="flex-1">{column.label}</span>

				{/* Modified Indicator */}
				{isModified && (
					<span
						className="inline-flex items-center"
						title="Modified from default"
						aria-label="Modified from default"
					>
						<Circle className="h-1.5 w-1.5 fill-primary text-primary" />
					</span>
				)}
			</label>

			{/* Individual Reset Button */}
			{isModified && (
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={e => {
						e.stopPropagation();
						onResetColumn();
					}}
					className={`
       mr-1 opacity-70
       hover:opacity-100
     `}
					aria-label={`Reset ${column.label} to default`}
					title="Reset to default"
				>
					<Undo2 className="h-3 w-3" />
				</Button>
			)}
		</div>
	);
}
