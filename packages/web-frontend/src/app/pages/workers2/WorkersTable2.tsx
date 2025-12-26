import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Badge } from '@framework/components/primitives/Badge';
import type { Worker } from '@shared/api/workers.contract';

/**
 * Workers table column definitions
 */
export const WORKERS_TABLE2_COLUMNS: Table2Column<Worker>[] = [
	{
		key: 'workerId',
		label: 'Worker ID',
		render: (w: Worker) => <span className="font-mono text-xs text-muted-foreground">{w.workerId}</span>,
	},
	{
		key: 'state',
		label: 'State',
		render: (w: Worker) => (
			<Badge variant={w.state === 'busy' ? 'warning' : 'success'} className="font-medium">
				{w.state === 'busy' ? 'Busy' : 'Idle'}
			</Badge>
		),
	},
	{
		key: 'connected',
		label: 'Connection',
		render: (w: Worker) => (
			<Badge variant={w.connected ? 'success' : 'destructive'} className="font-medium">
				{w.connected ? 'Connected' : 'Disconnected'}
			</Badge>
		),
	},
	{
		key: 'taskId',
		label: 'Current Task',
		render: (w: Worker) => <span className="text-sm">{w.taskId || '-'}</span>,
		sortable: false,
	},
];

export interface WorkersTable2Props extends Partial<Table2Props<Worker>> {
	// Add any custom props if needed
}

/**
 * Workers table component using Table2
 */
export function WorkersTable2(props: WorkersTable2Props) {
	return (
		<Table2
			columns={WORKERS_TABLE2_COLUMNS}
			getItemId={(w: Worker) => w.workerId}
			emptyMessage="No workers found."
			data={props.data ?? []}
			isLoading={props.isLoading ?? false}
			error={props.error ?? null}
			pagination={props.pagination}
			sorting={props.sorting}
			features={props.features}
			refreshing={props.refreshing}
		/>
	);
}
