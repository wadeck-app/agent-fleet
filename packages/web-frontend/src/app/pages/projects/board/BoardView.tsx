import { useState } from 'react';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { Task, TaskStatus } from '@shared/api/tasks.contract';

import { BoardColumn } from './BoardColumn';
import { TaskCard } from './TaskCard';
import { BOARD_STATUSES } from './boardHelpers';

/**
 * ===========================================================================================
 * BOARD VIEW COMPONENT
 * ===========================================================================================
 *
 * Main board container with drag-and-drop functionality.
 * - Horizontal scrollable container with columns for each task status
 * - DndContext from @dnd-kit/core for drag-and-drop
 * - Handles drag end event and calls update callback
 * - Shows drag overlay with task being dragged
 *
 * ===========================================================================================
 */

export interface BoardViewProps {
	tasksByStatus: Record<string, Task[]>;
	onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
}

export function BoardView({ tasksByStatus, onTaskStatusChange }: BoardViewProps) {
	const [activeTask, setActiveTask] = useState<Task | null>(null);

	const handleDragStart = (event: DragStartEvent) => {
		const task = event.active.data.current?.task as Task | undefined;
		if (task) {
			setActiveTask(task);
		}
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		setActiveTask(null);

		// Ignore if dropped outside a column or in the same column
		if (!over) return;

		const taskId = active.id as string;
		const newStatus = over.id as TaskStatus;

		// Get current task status
		const currentStatus = BOARD_STATUSES.find(status => {
			const tasks = tasksByStatus[status] || [];
			return tasks.some(task => task.id === taskId);
		});

		// Don't update if status hasn't changed
		if (currentStatus === newStatus) return;

		// Call the update callback
		try {
			await onTaskStatusChange(taskId, newStatus);
		} catch (error) {
			console.error('Failed to update task status:', error);
			// Error handling is done in the parent component (ProjectBoardPage)
		}
	};

	return (
		<DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			{/* Horizontal scrollable board */}
			<div className="flex gap-4 overflow-x-auto pb-4">
				{BOARD_STATUSES.map(status => {
					const tasks = tasksByStatus[status] || [];
					return <BoardColumn key={status} status={status} tasks={tasks} />;
				})}
			</div>

			{/* Drag overlay - shows the task being dragged */}
			<DragOverlay>
				{activeTask ? (
					<div className="rotate-3 scale-105">
						<TaskCard task={activeTask} isDragging />
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
