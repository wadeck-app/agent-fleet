import { useNavigate } from 'react-router-dom';

import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@framework/components/primitives/Badge';
import { cn } from '@framework/lib/utils';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Task } from '@shared/api/tasks.contract';
import { GripVertical } from 'lucide-react';

import { getPriorityBadgeVariant, getPriorityLabel } from './boardHelpers';

/**
 * ===========================================================================================
 * TASK CARD COMPONENT
 * ===========================================================================================
 *
 * Compact draggable task card for the project board.
 * - Displays task description, priority, worker, and created date
 * - Draggable using @dnd-kit/core
 * - Navigates to task detail page on click
 * - Shows visual feedback during drag
 *
 * ===========================================================================================
 */

export interface TaskCardProps {
	task: Task;
	isDragging?: boolean;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
	const navigate = useNavigate();

	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: task.id,
		data: { task },
	});

	const style = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
			}
		: undefined;

	const handleCardClick = (e: React.MouseEvent) => {
		// Prevent navigation when clicking drag handle
		if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
			return;
		}
		navigate(`/tasks/${task.id}`);
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				`
      group relative cursor-pointer rounded-lg border border-border bg-card p-3
      shadow-sm transition-all
      hover:border-primary/50 hover:shadow-md
    `,
				isDragging && 'opacity-50'
			)}
			onClick={handleCardClick}
		>
			{/* Drag handle */}
			<div
				{...attributes}
				{...listeners}
				data-drag-handle
				className={`
      absolute top-2 left-2 cursor-grab opacity-0 transition-opacity
      group-hover:opacity-100
      active:cursor-grabbing
    `}
				aria-label="Drag task"
			>
				<GripVertical className="size-4 text-muted-foreground" />
			</div>

			{/* Card content */}
			<div className="space-y-2 pl-6">
				{/* Task description */}
				<p className="line-clamp-2 text-sm font-medium text-foreground">{task.description}</p>

				{/* Metadata */}
				<div className="flex flex-wrap items-center gap-2">
					{/* Priority badge */}
					<Badge variant={getPriorityBadgeVariant(task.priority)} className="text-xs">
						{getPriorityLabel(task.priority)}
					</Badge>

					{/* Worker ID */}
					{task.assignedWorker?.workerId && (
						<span className="text-xs text-muted-foreground">
							Worker: {task.assignedWorker.workerId.slice(0, 8)}...
						</span>
					)}
				</div>

				{/* Created date */}
				<div className="text-xs text-muted-foreground">{formatRelativeTime(task.createdAt)}</div>
			</div>
		</div>
	);
}
