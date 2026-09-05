import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { Table2, type Table2Column } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { Task } from '@shared/api/tasks.contract';
import { B2F_TASK_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { useWorkerTaskHistory } from '../hooks/useWorkerTaskHistory';

interface WorkerTaskHistoryTableProps {
	workerId: string;
}

/**
 * Worker task history table columns
 */
function createTaskHistoryColumns(): Table2Column<Task>[] {
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

	return [
		{
			key: 'id',
			label: 'Task ID',
			render: (task: Task) => (
				<Link to={`/tasks/${task.id}`} className="font-mono text-xs text-primary hover:underline">
					{task.id.substring(0, 8)}...
				</Link>
			),
		},
		{
			key: 'status',
			label: 'Status',
			render: (task: Task) => (
				<Badge variant={getStatusVariant(task.status)} className="font-medium">
					{task.status.replace('_', ' ')}
				</Badge>
			),
		},
		{
			key: 'createdAt',
			label: 'Created At',
			render: (task: Task) => <span className="text-sm">{formatDate(task.createdAt)}</span>,
		},
		{
			key: 'flowId',
			label: 'Flow ID',
			render: (task: Task) => (
				<span className="font-mono text-xs text-muted-foreground">{task.flowId || '-'}</span>
			),
			sortable: false,
		},
	];
}

/**
 * Displays task history for a worker using Data2 + Table2 pattern
 */
export function WorkerTaskHistoryTable({ workerId }: WorkerTaskHistoryTableProps) {
	const { pagination, sorting, cache, mutation, fetchTasks } = useWorkerTaskHistory({ workerId });

	// Realtime refresh on task updates
	useRealtimeRefresh({
		events: [B2F_TASK_UPDATED],
		onEvent: cache.actions.refresh,
		logPrefix: 'WorkerTaskHistoryTable',
	});

	const columns = createTaskHistoryColumns();

	const renderTable = useCallback(
		(props: QueryResultDisplayerProps<Task>) => {
			return (
				<Table2
					columns={columns}
					getItemId={(task: Task) => task.id}
					emptyMessage="No tasks found for this worker."
					{...props}
				/>
			);
		},
		[columns]
	);

	return (
		<Data2
			fetchData={fetchTasks}
			pagination={pagination}
			sorting={sorting}
			cache={cache}
			mutation={mutation}
			delegateLoadingToChildren={true}
		>
			{renderTable}
		</Data2>
	);
}
