import { useEffect, useState } from 'react';
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

export function TriggeredTasksSection({ ticketId }: { ticketId: string }) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const { transport } = useTransport();

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
				<Label>Triggered Tasks</Label>
				<div className="mt-2 flex items-center gap-2">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div>
			<Label>Triggered Tasks</Label>
			{tasks.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">No triggered tasks yet</p>
			) : (
				<div className="mt-2 space-y-2">
					{tasks.map(task => (
						<Link
							key={task.id}
							to={`/tasks/${task.id}`}
							className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent/50"
						>
							<div className="flex items-start justify-between gap-2">
								<p className="flex-1 truncate text-sm font-medium">{task.description}</p>
								<Badge
									variant={STATUS_VARIANTS[task.status] ?? 'secondary'}
									className="shrink-0 text-xs"
								>
									{task.status}
								</Badge>
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
								{task.flowId && (
									<span className="font-mono text-xs text-muted-foreground">{task.flowId}</span>
								)}
								{task.metadata?.triggerEvent && (
									<>
										<span className="text-xs text-muted-foreground">·</span>
										<span className="font-mono text-xs text-muted-foreground">
											{task.metadata.triggerEvent as string}
										</span>
									</>
								)}
								<span className="ml-auto text-xs text-muted-foreground">
									{formatRelativeTime(task.createdAt)}
								</span>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
