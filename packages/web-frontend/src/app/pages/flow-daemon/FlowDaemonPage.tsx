import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import {
	TabsContent,
	TabsList,
	TabsTrigger,
	TabsWithUrlState,
} from '@framework/components/primitives/TabsWithUrlState';

import { FlowLogsTab } from './components/FlowLogsTab';
import { FlowPluginsTab } from './components/FlowPluginsTab';
import { FlowWorkersTab } from './components/FlowWorkersTab';

/**
 * ===========================================================================================
 * FLOW DAEMON PAGE (read-only)
 * ===========================================================================================
 *
 * What `flow worker list`, `flow logs` and `flow plugins` show: live workers, daemon logs and
 * the plugin catalog. Each tab loads its data only when selected.
 *
 * ===========================================================================================
 */
export function FlowDaemonPage() {
	return (
		<Page>
			<PageHeader title="Flow daemon" />

			<TabsWithUrlState paramKey="tab" defaultValue="workers" groupId="daemon">
				<TabsList>
					<TabsTrigger value="workers">Workers</TabsTrigger>
					<TabsTrigger value="logs">Logs</TabsTrigger>
					<TabsTrigger value="plugins">Plugins</TabsTrigger>
				</TabsList>
				<TabsContent value="workers">
					<FlowWorkersTab />
				</TabsContent>
				<TabsContent value="logs">
					<FlowLogsTab />
				</TabsContent>
				<TabsContent value="plugins">
					<FlowPluginsTab />
				</TabsContent>
			</TabsWithUrlState>
		</Page>
	);
}
