import { Link } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import type { Task } from '@shared/api/tasks.contract';

interface TaskInfoPanelProps {
	task: Task;
}

/**
 * Sidebar panel with full task details (for split layout)
 */
export function TaskInfoPanel({ task }: TaskInfoPanelProps) {
	const formatDate = (isoString: string) => {
		return new Date(isoString).toISOString().replace('T', ' ').slice(0, 19);
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
		<div className="flex h-full flex-col gap-4 overflow-y-auto bg-card p-4">
			{/* Description */}
			<div>
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Description</h3>
				<p className="text-sm text-foreground">{task.description}</p>
			</div>

			{/* Status & Priority */}
			<div className="flex gap-2">
				<div className="flex-1">
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Status</h3>
					<Badge variant={getStatusVariant(task.status)} className="font-medium">
						{task.status.replace('_', ' ')}
					</Badge>
				</div>
				<div className="flex-1">
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Priority</h3>
					<Badge variant={getPriorityVariant(task.priority)} className="font-medium">
						{task.priority}
					</Badge>
				</div>
			</div>

			{/* Worker */}
			{task.assignedWorker && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Assigned Worker</h3>
					<p className="font-mono text-xs text-foreground">{task.assignedWorker.workerId}</p>
				</div>
			)}

			{/* Timestamps */}
			<div>
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Timeline</h3>
				<div className="flex flex-col gap-1 text-xs text-muted-foreground">
					<span>Created: {formatDate(task.createdAt)}</span>
					<span>Updated: {formatDate(task.updatedAt)}</span>
				</div>
			</div>

			{/* Flow Info */}
			{task.flowId && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Flow</h3>
					<p className="font-mono text-xs text-foreground">{task.flowId}</p>
				</div>
			)}

			{/* Triggered by */}
			{task.ticketId && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Triggered by</h3>
					<div className="flex items-center gap-2">
						{task.metadata?.triggerEvent && (
							<Badge variant="outline" className="font-mono text-xs">
								{task.metadata.triggerEvent as string}
							</Badge>
						)}
						<Link
							to={`/tickets/${task.ticketId}?tab=tasks#task-${task.id}`}
							title={`Ticket ID: ${task.ticketId}`}
							className="shrink-0 text-xs text-primary hover:underline"
						>
							view ticket: <span className="font-mono">{task.ticketId.slice(0, 8)}…</span>
						</Link>
					</div>
				</div>
			)}

			{/* Flow Result */}
			{task.flowResult && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-muted-foreground">Flow Result</h3>
					<Badge variant={task.flowResult.status === 'completed' ? 'success' : 'destructive'}>
						{task.flowResult.status}
					</Badge>
					{task.flowResult.error && <p className="mt-2 text-xs text-destructive">{task.flowResult.error}</p>}
				</div>
			)}
		</div>
	);
}
