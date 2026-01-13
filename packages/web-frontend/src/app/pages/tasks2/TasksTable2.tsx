import { Link } from 'react-router-dom';

import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { Task } from '@shared/api/tasks.contract';
import { Trash2 } from 'lucide-react';

/**
 * Format date for display
 */
function formatDate(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/**
 * Get badge variant for task status
 */
function getStatusVariant(status: Task['status']): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' {
	switch (status) {
		case 'approved':
		case 'merged':
			return 'success';
		case 'in_progress':
		case 'testing':
			return 'default';
		case 'review':
		case 'reviewing':
			return 'secondary';
		case 'blocked':
		case 'cancelled':
			return 'destructive';
		case 'changes_requested':
			return 'warning';
		default:
			return 'secondary';
	}
}

/**
 * Get badge variant for task priority
 */
function getPriorityVariant(priority: Task['priority']): 'default' | 'secondary' | 'warning' | 'destructive' {
	switch (priority) {
		case 'urgent':
			return 'destructive';
		case 'high':
			return 'warning';
		case 'medium':
			return 'default';
		case 'low':
			return 'secondary';
		default:
			return 'secondary';
	}
}

/**
 * Tasks table column definitions
 */
export const TASKS_TABLE2_COLUMNS: Table2Column<Task>[] = [
	{
		key: 'id',
		label: 'ID',
		render: (t: Task) => (
			<Link
				to={`/tasks/${t.id}/logs-stacked`}
				className="font-mono text-xs text-primary hover:underline"
				onClick={e => e.stopPropagation()}
			>
				{t.id}
			</Link>
		),
	},
	{
		key: 'flowId',
		label: 'Flow ID',
		render: (t: Task) => <span className="font-mono text-xs text-muted-foreground">{t.flowId || '-'}</span>,
	},
	{
		key: 'description',
		label: 'Description',
		render: (t: Task) => <span className="text-sm">{t.description}</span>,
	},
	{
		key: 'status',
		label: 'Status',
		render: (t: Task) => (
			<Badge variant={getStatusVariant(t.status)} className="font-medium">
				{t.status.replace('_', ' ')}
			</Badge>
		),
	},
	{
		key: 'priority',
		label: 'Priority',
		render: (t: Task) => (
			<Badge variant={getPriorityVariant(t.priority)} className="font-medium">
				{t.priority}
			</Badge>
		),
	},
	{
		key: 'assignedWorker',
		label: 'Worker',
		render: (t: Task) => <span className="font-mono text-xs">{t.assignedWorker?.workerId || '-'}</span>,
		sortable: false,
	},
	{
		key: 'createdAt',
		label: 'Created',
		render: (t: Task) => (
			<span className="text-xs text-muted-foreground" title={new Date(t.createdAt).toLocaleString()}>
				{formatDate(t.createdAt)}
			</span>
		),
	},
];

export interface TasksTable2Props extends Partial<Table2Props<Task>> {
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Optional refreshing state - from Data2 */
	refreshing?: boolean;
	/** Optional deleting state - for bulk delete blur effect */
	deleting?: boolean;
	/** IDs of items being deleted - for strike-through effect */
	deletingIds?: Set<string>;
	/** Selection toggle callback */
	onSelectionToggle?: (id: string) => void;
	/** Select all callback */
	onSelectAll?: (ids: string[]) => void;
}

/**
 * Tasks table component using Table2
 */
export function TasksTable2({
	onDelete,
	refreshing,
	deleting,
	deletingIds,
	onSelectionToggle,
	onSelectAll,
	...props
}: TasksTable2Props) {
	// Build actions column if onDelete is provided
	const renderActions = onDelete
		? (task: Task) => (
				<div className="flex items-center justify-center gap-2">
					<Button
						size="sm"
						variant="destructive"
						onClick={() => onDelete(task.id)}
						aria-label={`Delete ${task.description}`}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			)
		: undefined;

	return (
		<Table2
			columns={TASKS_TABLE2_COLUMNS}
			getItemId={(t: Task) => t.id}
			renderActions={renderActions}
			emptyMessage="No tasks found. Create your first task to get started."
			data={props.data ?? []}
			isLoading={props.isLoading ?? false}
			error={props.error ?? null}
			pagination={props.pagination}
			sorting={props.sorting}
			features={props.features}
			refreshing={refreshing}
			deleting={deleting}
			deletingIds={deletingIds}
			onSelectionToggle={onSelectionToggle}
			onSelectAll={onSelectAll}
		/>
	);
}
