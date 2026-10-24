import { Table, type TableColumn } from '@framework/components/table/Table';
import type { FlowPluginsResponse } from '@shared/api/flow-daemon.contract';

type FlowPlugin = FlowPluginsResponse['plugins'][number];

const columns: TableColumn<FlowPlugin>[] = [
	{ key: 'id', label: 'Plugin', render: plugin => <span className="font-mono text-xs">{plugin.id}</span> },
	{
		key: 'extensionPoint',
		label: 'Extension point',
		render: plugin => <span className="text-sm">{plugin.extensionPoint}</span>,
	},
	{
		key: 'typeString',
		label: 'Type',
		render: plugin => <span className="font-mono text-xs break-all">{plugin.typeString}</span>,
	},
];

export interface FlowPluginsTableProps {
	plugins: FlowPlugin[];
	selectedId: string | null;
	onSelect: (pluginId: string) => void;
}

export function FlowPluginsTable({ plugins, selectedId, onSelect }: FlowPluginsTableProps) {
	return (
		<Table
			data={plugins}
			columns={columns}
			getItemId={plugin => plugin.id}
			onRowClick={plugin => onSelect(plugin.id)}
			getRowClassName={plugin => (plugin.id === selectedId ? 'bg-primary/10' : '')}
			emptyMessage="No plugin is registered."
		/>
	);
}
