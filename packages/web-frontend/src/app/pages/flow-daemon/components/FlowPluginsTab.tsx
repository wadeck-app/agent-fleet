import { useState } from 'react';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';

import { useFlowPlugins } from '../hooks/useFlowPlugins';
import { FlowPluginDetailPanel } from './FlowPluginDetailPanel';
import { FlowPluginsTable } from './FlowPluginsTable';

/** Plugin catalog; clicking a plugin shows its snippet and options. */
export function FlowPluginsTab() {
	const { data, error } = useFlowPlugins();
	const [selectedId, setSelectedId] = useState<string | null>(null);

	if (error !== null) {
		return <ErrorAlert message={error} />;
	}
	if (data === null) {
		return <LoadingState message="Loading plugins..." />;
	}

	return (
		<div className="flex flex-col gap-6">
			<FlowPluginsTable plugins={data.plugins} selectedId={selectedId} onSelect={setSelectedId} />
			{selectedId !== null && <FlowPluginDetailPanel key={selectedId} pluginId={selectedId} />}
		</div>
	);
}
