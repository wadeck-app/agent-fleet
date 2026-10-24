import { Badge } from '@framework/components/primitives/Badge';
import { Table, type TableColumn } from '@framework/components/table/Table';
import type { FlowWorkersResponse } from '@shared/api/flow-daemon.contract';

type FlowWorker = FlowWorkersResponse['workers'][number];

function joinOrDash(values: string[]): string {
	return values.length === 0 ? '-' : values.join(', ');
}

const columns: TableColumn<FlowWorker>[] = [
	{
		key: 'workerId',
		label: 'Worker',
		render: worker => (
			<span className="flex items-center gap-2 font-mono text-xs">
				{worker.workerId}
				{worker.ephemeral && <Badge variant="outline">ephemeral</Badge>}
			</span>
		),
	},
	{
		key: 'state',
		label: 'State',
		render: worker => <Badge variant={worker.state === 'busy' ? 'warning' : 'success'}>{worker.state}</Badge>,
	},
	{ key: 'pid', label: 'PID', render: worker => <span className="text-sm">{worker.pid}</span> },
	{ key: 'version', label: 'Version', render: worker => <span className="text-sm">{worker.version ?? '-'}</span> },
	{ key: 'sourceId', label: 'Source', render: worker => <span className="text-sm">{worker.sourceId ?? '-'}</span> },
	{ key: 'labels', label: 'Labels', render: worker => <span className="text-sm">{joinOrDash(worker.labels)}</span> },
	{
		key: 'attachedProjects',
		label: 'Projects',
		render: worker => <span className="font-mono text-xs break-all">{joinOrDash(worker.attachedProjects)}</span>,
	},
	{
		key: 'shellCapabilities',
		label: 'Shells',
		render: worker => <span className="text-sm">{joinOrDash(worker.shellCapabilities ?? [])}</span>,
	},
	{
		key: 'hasUserInterface',
		label: 'UI',
		render: worker => <span className="text-sm">{worker.hasUserInterface ? 'yes' : 'no'}</span>,
	},
];

export interface FlowWorkersTableProps {
	workers: FlowWorker[];
}

export function FlowWorkersTable({ workers }: FlowWorkersTableProps) {
	return (
		<Table
			data={workers}
			columns={columns}
			getItemId={worker => worker.workerId}
			emptyMessage="No worker is connected."
		/>
	);
}
