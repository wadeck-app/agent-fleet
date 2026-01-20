import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { Workspace } from '@shared/api/workspaces.contract';
import { ArrowRight, GripVertical } from 'lucide-react';

/**
 * ===========================================================================================
 * SORTABLE ASSOCIATED WORKSPACE ITEM COMPONENT
 * ===========================================================================================
 *
 * Draggable associated workspace item with dissociate button.
 *
 * Features:
 * - Drag handle with visual feedback (GripVertical icon)
 * - Workspace color dot and name display
 * - Task count display
 * - Arrow right button (→) to dissociate the workspace
 * - Visual feedback during drag (opacity, transform)
 * - Touch-friendly (supports dnd-kit touch sensors)
 *
 * Usage:
 *   <SortableAssociatedWorkspaceItem
 *     workspace={workspace}
 *     onDissociate={handleDissociate}
 *     isLoading={false}
 *   />
 *
 * ===========================================================================================
 */

export interface SortableAssociatedWorkspaceItemProps {
	/** Workspace to display */
	workspace: Workspace;
	/** Callback when dissociate button is clicked */
	onDissociate: (workspaceId: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
	/** Whether this item is being reordered */
	isReordering?: boolean;
}

// Helper to extract basename from path
function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}

export function SortableAssociatedWorkspaceItem({
	workspace,
	onDissociate,
	isLoading = false,
	isReordering = false,
}: SortableAssociatedWorkspaceItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: workspace.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : isLoading ? 0.7 : 1,
	};

	const displayName = workspace.name || getBasename(workspace.path);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex items-center gap-1 rounded-sm transition-colors',
				'hover:bg-accent',
				isLoading && 'pointer-events-none opacity-50',
				isDragging && 'z-50'
			)}
		>
			{/* Drag Handle */}
			{/* eslint-disable-next-line no-restricted-syntax */}
			<button
				{...attributes}
				{...listeners}
				className={cn(
					'cursor-grab touch-none p-2 opacity-40 transition-opacity duration-150',
					'hover:opacity-70',
					'active:cursor-grabbing'
				)}
				aria-label={`Reorder ${displayName}`}
				title="Drag to reorder"
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* Workspace Color Dot */}
			{workspace.color && (
				<div
					className={cn(
						'h-3 w-3 rounded-full border border-border transition-opacity',
						isReordering && 'opacity-40'
					)}
					style={{ backgroundColor: workspace.color }}
					title={workspace.color}
				/>
			)}

			{/* Workspace Name */}
			<span
				className={cn(
					'flex-1 px-2 py-1.5 text-sm transition-opacity',
					isReordering &&
						`
     opacity-40
   `
				)}
			>
				{displayName}
			</span>

			{/* Task Count */}
			<Badge
				variant="secondary"
				className={cn('text-xs transition-opacity', isReordering && 'opacity-40')}
				title={`${workspace.tasksCount} task(s)`}
			>
				{workspace.tasksCount}
			</Badge>

			{/* Dissociate Button (Arrow Right) - Positioned on the right */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					if (!isDragging) {
						onDissociate(workspace.id);
					}
				}}
				disabled={isLoading}
				className={cn(
					`
      mr-1 opacity-70
      hover:opacity-100
    `,
					isDragging && `pointer-events-none`
				)}
				aria-label={`Dissociate ${displayName}`}
				title="Dissociate workspace"
			>
				<ArrowRight className="size-5" />
			</Button>
		</div>
	);
}
