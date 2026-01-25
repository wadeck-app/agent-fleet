import { type ReactNode } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@framework/lib/utils';
import { GripVertical, type LucideIcon } from 'lucide-react';

import { Button } from '../primitives/Button';

/**
 * ===========================================================================================
 * DUAL LIST ITEM COMPONENT
 * ===========================================================================================
 *
 * Generic reusable component for rendering items in a dual-list dialog.
 * Supports both "available" (non-sortable) and "sortable" (draggable) variants.
 *
 * Features:
 * - Two variants: "available" (with action button on left) and "sortable" (with drag handle)
 * - Customizable icon, label, and badge
 * - Action button with custom icon and callback
 * - Loading and reordering states
 * - Drag & drop support for sortable variant
 * - Hover effects and visual feedback
 *
 * This component replaces:
 * - AvailableProjectItem.tsx (77 lines)
 * - SortablePinnedProjectItem.tsx (116 lines)
 * - AvailableWorkspaceItem.tsx (94 lines)
 * - SortableAssociatedWorkspaceItem.tsx (155 lines)
 *
 * Total reduction: 442 lines → ~100 lines
 *
 * Usage:
 *   // Available item (with pin/associate button)
 *   <DualListItem
 *     itemId="project-1"
 *     variant="available"
 *     icon={<ProjectIcon />}
 *     label="My Project"
 *     badge={<Badge>5</Badge>}
 *     onAction={handlePin}
 *     actionIcon={ArrowLeft}
 *     actionLabel="Pin project"
 *     isLoading={false}
 *   />
 *
 *   // Sortable item (with drag handle and unpin/dissociate button)
 *   <DualListItem
 *     itemId="project-1"
 *     variant="sortable"
 *     icon={<ProjectIcon />}
 *     label="My Project"
 *     badge={<Badge>5</Badge>}
 *     onAction={handleUnpin}
 *     actionIcon={ArrowRight}
 *     actionLabel="Unpin project"
 *     isLoading={false}
 *     isReordering={false}
 *   />
 *
 * ===========================================================================================
 */

export interface DualListItemProps {
	/** Unique identifier for the item (used for DnD) */
	itemId: string;

	/** Variant: "available" (action button on left) or "sortable" (drag handle + action button) */
	variant: 'available' | 'sortable';

	// Rendering
	/** Icon to display (optional) */
	icon?: ReactNode;
	/** Label text to display */
	label: string;
	/** Badge to display (optional) */
	badge?: ReactNode;

	// Actions
	/** Callback when action button is clicked */
	onAction: (itemId: string) => void;
	/** Icon for the action button */
	actionIcon: LucideIcon;
	/** Aria label for the action button */
	actionLabel: string;

	// State
	/** Whether this item is in a loading state */
	isLoading?: boolean;
	/** Whether this item is being reordered (sortable only) */
	isReordering?: boolean;
}

export function DualListItem({
	itemId,
	variant,
	icon,
	label,
	badge,
	onAction,
	actionIcon: ActionIcon,
	actionLabel,
	isLoading = false,
	isReordering = false,
}: DualListItemProps) {
	// Only use sortable for "sortable" variant
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: itemId,
		disabled: variant !== 'sortable',
	});

	const style =
		variant === 'sortable'
			? {
					transform: CSS.Transform.toString(transform),
					transition,
					// Only set opacity for dragging state - let CSS classes handle loading/reordering
					...(isDragging ? { opacity: 0.5 } : {}),
				}
			: undefined;

	// Common container classes
	const containerClasses = cn(
		'flex items-center gap-2 rounded-sm transition-colors',
		'hover:bg-accent',
		// Loading state disables interactions and reduces opacity
		(isLoading || (variant === 'sortable' && isReordering)) && 'pointer-events-none opacity-50',
		// Dragging state increases z-index
		variant === 'sortable' && isDragging && 'z-50'
	);

	// Render "available" variant (action button on left, no drag handle)
	if (variant === 'available') {
		return (
			<div className={containerClasses}>
				{/* Action Button (Left) */}
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={e => {
						e.stopPropagation();
						onAction(itemId);
					}}
					disabled={isLoading}
					className="opacity-70 hover:opacity-100"
					aria-label={actionLabel}
					title={actionLabel}
				>
					<ActionIcon className="size-5" />
				</Button>

				{/* Icon */}
				{icon}

				{/* Label */}
				<span className="flex-1 text-sm">{label}</span>

				{/* Badge */}
				{badge}
			</div>
		);
	}

	// Render "sortable" variant (drag handle on left, action button on right)
	return (
		<div ref={setNodeRef} style={style} className={containerClasses}>
			{/* Drag Handle */}
			<button
				{...attributes}
				{...listeners}
				className={cn(
					'cursor-grab touch-none p-2 opacity-40 transition-opacity duration-150',
					'hover:opacity-70',
					'active:cursor-grabbing'
				)}
				aria-label={`Reorder ${label}`}
				title="Drag to reorder"
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* Icon */}
			{icon}

			{/* Label */}
			<span className="flex-1 px-2 py-1.5 text-sm">{label}</span>

			{/* Badge */}
			{badge}

			{/* Action Button (Right) */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					if (!isDragging) {
						onAction(itemId);
					}
				}}
				disabled={isLoading}
				className={cn('mr-1 opacity-70 hover:opacity-100', isDragging && 'pointer-events-none')}
				aria-label={actionLabel}
				title={actionLabel}
			>
				<ActionIcon className="size-5" />
			</Button>
		</div>
	);
}
