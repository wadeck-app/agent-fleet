import { Table, type TableColumn } from '@framework/components/table/Table';
import type { FlowWorkersResponse } from '@shared/api/flow-daemon.contract';

type FlowDeclaredSource = FlowWorkersResponse['declaredSources'][number];

const columns: TableColumn<FlowDeclaredSource>[] = [
	{
		key: 'sourceId',
		label: 'Source',
		render: source => <span className="font-mono text-xs">{source.sourceId}</span>,
	},
	{ key: 'provider', label: 'Provider', render: source => <span className="text-sm">{source.provider}</span> },
	{
		key: 'labels',
		label: 'Labels',
		render: source => (
			<span className="text-sm">{source.labels.length === 0 ? '-' : source.labels.join(', ')}</span>
		),
	},
	{ key: 'maxWorkers', label: 'Max workers', render: source => <span className="text-sm">{source.maxWorkers}</span> },
];

export interface FlowDeclaredSourcesTableProps {
	sources: FlowDeclaredSource[];
}

/** Worker sources declared in the flow configuration (what the daemon may start). */
export function FlowDeclaredSourcesTable({ sources }: FlowDeclaredSourcesTableProps) {
	return (
		<Table
			data={sources}
			columns={columns}
			getItemId={source => source.sourceId}
			emptyMessage="No worker source is declared."
		/>
	);
}
