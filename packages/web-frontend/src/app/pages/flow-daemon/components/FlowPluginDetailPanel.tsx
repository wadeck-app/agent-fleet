import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { MonospaceBlock } from '@framework/components/primitives/MonospaceBlock';
import { Table, type TableColumn } from '@framework/components/table/Table';

import { useFlowPluginDetail } from '../hooks/useFlowPlugins';

interface PluginOption {
	name: string;
	type: string;
}

const optionColumns: TableColumn<PluginOption>[] = [
	{ key: 'name', label: 'Option', render: option => <span className="font-mono text-xs">{option.name}</span> },
	{
		key: 'type',
		label: 'Type',
		render: option => <span className="font-mono text-xs break-all">{option.type}</span>,
	},
];

export interface FlowPluginDetailPanelProps {
	pluginId: string;
}

/** Usage snippet and options of one plugin. Mount with `key={pluginId}` so a previous plugin never lingers. */
export function FlowPluginDetailPanel({ pluginId }: FlowPluginDetailPanelProps) {
	const { data: plugin, error } = useFlowPluginDetail(pluginId);

	if (error !== null) {
		return <ErrorAlert message={error} />;
	}
	if (plugin === null) {
		return <LoadingState message="Loading plugin..." />;
	}

	const options: PluginOption[] = Object.entries(plugin.options).map(([name, type]) => ({ name, type }));

	return (
		<section aria-label={`Plugin ${plugin.id}`} className="flex flex-col gap-4">
			<h3 className="text-lg font-semibold">{plugin.id}</h3>
			<MonospaceBlock label="Plugin snippet" text={plugin.snippet} />
			<Table
				data={options}
				columns={optionColumns}
				getItemId={option => option.name}
				emptyMessage="This plugin has no option."
			/>
		</section>
	);
}
