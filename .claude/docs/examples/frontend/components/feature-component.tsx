// @ts-nocheck - Example code, not compiled
// Feature-Specific Component Pattern
// Composes generic components with domain logic
import * as React from 'react';

import { CheckCircle2, Circle, Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { Button } from './generic-component';

interface Task {
	id: string;
	title: string;
	description?: string;
	status: 'todo' | 'in_progress' | 'done';
	priority: 'low' | 'medium' | 'high';
	dueDate?: string;
}

interface TaskCardProps {
	task: Task;
	onStatusChange?: (taskId: string, status: Task['status']) => void;
	onDelete?: (taskId: string) => void;
	className?: string;
}

/**
 * Feature-specific TaskCard component
 * - Composes generic Button and Shadcn/ui Card components
 * - Contains domain logic (task management)
 * - Receives data and callbacks via props
 * - Styled with Tailwind utilities
 */
export function TaskCard({ task, onStatusChange, onDelete, className }: TaskCardProps) {
	const statusIcons = {
		todo: <Circle className="h-4 w-4" />,
		in_progress: <Clock className="h-4 w-4" />,
		done: <CheckCircle2 className="h-4 w-4" />,
	};

	const statusColors = {
		todo: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
		in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
		done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
	};

	const priorityColors = {
		low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
		medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
		high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
	};

	const handleComplete = () => {
		onStatusChange?.(task.id, 'done');
	};

	const handleReopen = () => {
		onStatusChange?.(task.id, 'todo');
	};

	const handleStart = () => {
		onStatusChange?.(task.id, 'in_progress');
	};

	const handleDelete = () => {
		onDelete?.(task.id);
	};

	return (
		<Card className={cn('w-full', className)}>
			<CardContent className="pt-6">
				<div className="space-y-3">
					{/* Title and Status */}
					<div className="flex items-start justify-between gap-2">
						<h3 className="text-lg font-semibold text-foreground">{task.title}</h3>
						<Badge className={cn('flex items-center gap-1', statusColors[task.status])}>
							{statusIcons[task.status]}
							<span className="capitalize">{task.status.replace('_', ' ')}</span>
						</Badge>
					</div>

					{/* Description */}
					{task.description && (
						<p className="text-sm text-muted-foreground">{task.description}</p>
					)}

					{/* Priority and Due Date */}
					<div className="flex items-center gap-2">
						<Badge variant="outline" className={priorityColors[task.priority]}>
							{task.priority}
						</Badge>
						{task.dueDate && (
							<span className="text-xs text-muted-foreground">
								Due: {new Date(task.dueDate).toLocaleDateString()}
							</span>
						)}
					</div>
				</div>
			</CardContent>

			<CardFooter className="flex gap-2">
				{/* Action buttons based on status */}
				{task.status === 'todo' && (
					<Button variant="default" onClick={handleStart} className="flex-1">
						Start Task
					</Button>
				)}
				{task.status === 'in_progress' && (
					<Button variant="default" onClick={handleComplete} className="flex-1">
						Complete
					</Button>
				)}
				{task.status === 'done' && (
					<Button variant="secondary" onClick={handleReopen} className="flex-1">
						Reopen
					</Button>
				)}
				<Button variant="destructive" onClick={handleDelete}>
					Delete
				</Button>
			</CardFooter>
		</Card>
	);
}
