import { useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { Task } from '@shared/api/tasks.contract';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TaskInfoCardProps {
	task: Task;
	collapsible?: boolean;
	defaultOpen?: boolean;
}

/**
 * Collapsible card with task details (for stacked layout)
 */
export function TaskInfoCard({ task, collapsible = true, defaultOpen = true }: TaskInfoCardProps) {
	const formatDate = (isoString: string) => {
		return new Date(isoString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getStatusVariant = (status: Task['status']) => {
		const statusMap: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
			approved: 'success',
			merged: 'success',
			in_progress: 'default',
			awaiting_user: 'warning',
			testing: 'default',
			review: 'secondary',
			reviewing: 'secondary',
			blocked: 'destructive',
			cancelled: 'destructive',
			changes_requested: 'warning',
		};
		return statusMap[status] || 'secondary';
	};

	const getPriorityVariant = (priority: Task['priority']) => {
		const priorityMap: Record<string, 'default' | 'secondary' | 'warning' | 'destructive'> = {
			urgent: 'destructive',
			high: 'warning',
			medium: 'default',
			low: 'secondary',
		};
		return priorityMap[priority] || 'secondary';
	};

	return (
		<div className="rounded-lg border border-border bg-card">
			{/* Header (always visible) */}
			<div className={`flex items-center gap-4 p-4 ${collapsible ? 'cursor-pointer hover:bg-muted/50' : ''}`}>
				<div className="flex-1">
					<div className="mb-2 flex items-center gap-2">
						<h2 className="text-lg font-semibold text-foreground">{task.description}</h2>
					</div>
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<Badge variant={getStatusVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
						<Badge variant={getPriorityVariant(task.priority)}>{task.priority}</Badge>
						{task.assignedWorker && (
							<span className="text-muted-foreground">
								Worker: <span className="font-mono text-xs">{task.assignedWorker.workerId}</span>
							</span>
						)}
						{task.flowId && (
							<span className="text-muted-foreground">
								Flow: <span className="font-mono text-xs">{task.flowId}</span>
							</span>
						)}
						<span className="text-muted-foreground">Created: {formatDate(task.createdAt)}</span>
						<span className="text-muted-foreground">Updated: {formatDate(task.updatedAt)}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
