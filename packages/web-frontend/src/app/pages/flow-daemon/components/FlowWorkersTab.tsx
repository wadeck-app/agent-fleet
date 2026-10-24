import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Button } from '@framework/components/primitives/Button';
import type { FlowWorkersResponse } from '@shared/api/flow-daemon.contract';

import { formatTimestamp } from '../flowDaemonFormat';
import { useFlowWorkers } from '../hooks/useFlowWorkers';
import { FlowDeclaredSourcesTable } from './FlowDeclaredSourcesTable';
import { FlowWorkersTable } from './FlowWorkersTable';

function describeDaemon(daemon: FlowWorkersResponse['daemon']): string {
	if (!daemon.running) {
		return `Daemon not running: ${daemon.reason}`;
	}
	const details = [
		daemon.pid === undefined ? undefined : `pid ${daemon.pid}`,
		daemon.port === undefined ? undefined : `port ${daemon.port}`,
		daemon.startedAt === undefined ? undefined : `started ${formatTimestamp(daemon.startedAt)}`,
	].filter((detail): detail is string => detail !== undefined);
	return details.length === 0 ? 'Daemon running' : `Daemon running (${details.join(', ')})`;
}

/** Live workers; when there is none, explains why and lists the declared sources. */
export function FlowWorkersTab() {
	const { data, loading, error, refresh } = useFlowWorkers();

	if (error !== null) {
		return (
			<div className="flex flex-col items-start gap-4">
				<ErrorAlert className="w-full" message={error} />
				<Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
					Retry
				</Button>
			</div>
		);
	}
	if (data === null) {
		return <LoadingState message="Loading workers..." />;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">{describeDaemon(data.daemon)}</p>
				<Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
					Refresh
				</Button>
			</div>

			{data.declaredSourcesError !== undefined && (
				<ErrorAlert message={`Declared worker sources could not be read: ${data.declaredSourcesError}`} />
			)}

			{data.workers.length > 0 ? (
				<FlowWorkersTable workers={data.workers} />
			) : (
				<>
					<p className="rounded-md border border-border bg-muted/40 p-4 text-sm">
						{data.emptyExplanation ?? 'No worker is connected.'}
					</p>
					{data.declaredSourcesError === undefined && (
						<>
							<h3 className="text-lg font-semibold">Declared worker sources</h3>
							<FlowDeclaredSourcesTable sources={data.declaredSources} />
						</>
					)}
				</>
			)}
		</div>
	);
}
