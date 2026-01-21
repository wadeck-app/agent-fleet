import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { Project } from '@shared/api/projects.contract';
import { ArrowRight, GripVertical } from 'lucide-react';

/**
 * ===========================================================================================
 * SORTABLE PINNED PROJECT ITEM COMPONENT
 * ===========================================================================================
 *
 * Draggable pinned project item with unpin button.
 *
 * Features:
 * - Drag handle with visual feedback (GripVertical icon)
 * - Project icon and name display
 * - Arrow right button (→) to unpin the project
 * - Visual feedback during drag (opacity, transform)
 * - Touch-friendly (supports dnd-kit touch sensors)
 *
 * Usage:
 *   <SortablePinnedProjectItem
 *     project={project}
 *     onUnpin={handleUnpin}
 *     isLoading={false}
 *   />
 *
 * ===========================================================================================
 */

export interface SortablePinnedProjectItemProps {
	/** Project to display */
	project: Project;
	/** Callback when unpin button is clicked */
	onUnpin: (projectId: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
	/** Whether this item is being reordered */
	isReordering?: boolean;
}

export function SortablePinnedProjectItem({
	project,
	onUnpin,
	isLoading = false,
	isReordering = false,
}: SortablePinnedProjectItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: project.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

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
				aria-label={`Reorder ${project.name}`}
				title="Drag to reorder"
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* Project Icon */}
			{project.icon && (
				<DynamicLucideIcon
					name={project.icon}
					color={project.iconColor || '#6366F1'}
					className={cn('h-4 w-4 transition-opacity', isReordering && 'opacity-40')}
				/>
			)}

			{/* Project Name */}
			<span className={cn('flex-1 px-2 py-1.5 text-sm transition-opacity', isReordering && `opacity-40`)}>
				{project.name}
			</span>

			{/* Unpin Button (Arrow Right) - Positioned on the right */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					if (!isDragging) {
						onUnpin(project.id);
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
				aria-label={`Unpin ${project.name}`}
				title="Unpin project"
			>
				<ArrowRight className="size-5" />
			</Button>
		</div>
	);
}
