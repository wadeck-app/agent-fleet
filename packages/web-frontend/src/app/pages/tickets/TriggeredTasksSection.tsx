import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Task, TaskStatus } from '@shared/api/tasks.contract';
import { B2F_TASKS_UPDATED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport';

import { tasksApi } from '../tasks/tasks.api';

/**
 * Map task status to badge variant (copy from tasks page pattern)
 */
const STATUS_VARIANTS: Record<TaskStatus, 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive'> = {
	backlog: 'secondary',
	refining: 'secondary',
	refined: 'secondary',
	prioritizing: 'secondary',
	todo: 'default',
	in_progress: 'info',
	awaiting_user: 'warning',
	testing: 'info',
	review: 'warning',
	reviewing: 'warning',
	changes_requested: 'destructive',
	approved: 'success',
	merged: 'success',
	blocked: 'destructive',
	cancelled: 'destructive',
};

export function TriggeredTasksSection({
	ticketId,
	sortOrder = 'asc',
	showLabel = true,
}: {
	ticketId: string;
	sortOrder?: 'asc' | 'desc';
	showLabel?: boolean;
}) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const { transport } = useTransport();

	// Derive selected task from URL hash (permanent, no timeout)
	const selectedTaskId = window.location.hash.startsWith('#task-')
		? window.location.hash.slice('#task-'.length)
		: null;

	// Sort tasks based on sortOrder
	const sortedTasks = useMemo(() => {
		if (!tasks) return [];
		const sorted = [...tasks];
		sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
		return sortOrder === 'desc' ? sorted.reverse() : sorted;
	}, [tasks, sortOrder]);

	const fetchTasks = async () => {
		try {
			const response = await tasksApi.getTasksList({ ticketId, pageSize: 100 });
			setTasks(response.items);
		} catch (err) {
			console.error('Failed to fetch triggered tasks:', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchTasks();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId]);

	// Scroll to selected task after tasks load
	useEffect(() => {
		if (!selectedTaskId) return;
		const el = document.getElementById(`task-${selectedTaskId}`);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [tasks, selectedTaskId]);

	// Realtime refresh on tasks updated
	useEffect(() => {
		const unsub = transport.subscribe(B2F_TASKS_UPDATED, () => {
			fetchTasks();
		});
		return unsub;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId, transport]);

	if (loading) {
		return (
			<div>
				{showLabel && <Label>Triggered Tasks</Label>}
				<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
					<Loader2 className="size-6 animate-spin" />
					<p className="text-sm">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<div>
			{showLabel && <Label>Triggered Tasks</Label>}
			{sortedTasks.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">No triggered tasks yet</p>
			) : (
				<div className="mt-2">
					{sortedTasks.map(task => (
						<div
							key={task.id}
							id={`task-${task.id}`}
							className={`flex items-center gap-2 border-b py-1.5 last:border-b-0 text-xs ${selectedTaskId === task.id ? 'border-l-2 border-l-primary pl-1' : 'pl-0'}`}
						>
							{task.flowId && <span className="font-mono text-muted-foreground">{task.flowId}</span>}
							<Badge variant={STATUS_VARIANTS[task.status] ?? 'secondary'} className="shrink-0 text-xs">
								{task.status}
							</Badge>
							{task.metadata?.triggerEvent && (
								<span className="font-mono text-muted-foreground">
									{task.metadata.triggerEvent as string}
								</span>
							)}
							<span className="text-muted-foreground">{formatRelativeTime(task.createdAt)}</span>
							<span className="flex-1" />
							<Link
								to={`/tasks/${task.id}`}
								title={`Task ID: ${task.id}`}
								className="shrink-0 text-xs text-primary hover:underline"
							>
								view task: <span className="font-mono">{task.id.slice(0, 8)}…</span>
							</Link>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
