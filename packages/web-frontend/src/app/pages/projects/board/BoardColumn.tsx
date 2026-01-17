import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@framework/components/primitives/Badge';
import { cn } from '@framework/lib/utils';
import type { Task, TaskStatus } from '@shared/api/tasks.contract';

import { TaskCard } from './TaskCard';
import { getStatusLabel } from './boardHelpers';

/**
 * ===========================================================================================
 * BOARD COLUMN COMPONENT
 * ===========================================================================================
 *
 * Individual column for a task status on the project board.
 * - Displays status name and task count
 * - Droppable zone using @dnd-kit/core
 * - Vertical scrollable container for tasks
 * - Shows empty state when no tasks
 * - Visual feedback when dragging over
 *
 * ===========================================================================================
 */

export interface BoardColumnProps {
	status: TaskStatus;
	tasks: Task[];
	onTaskClick?: (task: Task) => void;
}

export function BoardColumn({ status, tasks }: BoardColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: status,
		data: { status },
	});

	return (
		<div className="flex w-80 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
			{/* Column header */}
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 className="text-sm font-semibold text-foreground">{getStatusLabel(status)}</h3>
				<Badge variant="secondary" className="text-xs">
					{tasks.length}
				</Badge>
			</div>

			{/* Droppable area */}
			<div
				ref={setNodeRef}
				className={cn(
					`
          flex max-h-[calc(100vh-280px)] min-h-[200px] flex-1 flex-col gap-3
          overflow-y-auto p-3 transition-colors
        `,
					isOver && 'bg-primary/5 ring-2 ring-primary/20 ring-inset'
				)}
			>
				{tasks.length === 0 ? (
					// Empty state
					<div className="flex flex-1 items-center justify-center">
						<p className="text-sm text-muted-foreground">No tasks</p>
					</div>
				) : (
					// Task cards
					tasks.map(task => <TaskCard key={task.id} task={task} />)
				)}
			</div>
		</div>
	);
}
