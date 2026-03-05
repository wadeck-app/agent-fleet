import { useNavigate, useParams } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Button } from '@framework/components/primitives/Button';
import {
	TabsContent,
	TabsList,
	TabsTrigger,
	TabsWithUrlState,
} from '@framework/components/primitives/TabsWithUrlState';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED, B2F_WORKER_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { WorkerFlowsList } from './components/WorkerFlowsList';
import { WorkerInfoPanel } from './components/WorkerInfoPanel';
import { WorkerMetricsGrid } from './components/WorkerMetricsGrid';
import { WorkerTaskHistoryTable } from './components/WorkerTaskHistoryTable';
import { useWorker } from './hooks/useWorker';

/**
 * Worker Detail Page - Stacked Layout
 * Full-width layout with metrics at top, tabs below
 */
export function WorkerDetailStackedPage() {
	const { workerId } = useParams<{ workerId: string }>();
	const navigate = useNavigate();

	const { worker, isLoading, isError, error, refetch } = useWorker(workerId ?? '');

	// Realtime refresh on worker events
	useRealtimeRefresh({
		events: [B2F_WORKER_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
		onEvent: refetch,
		logPrefix: 'WorkerDetailStackedPage',
	});

	if (!workerId) {
		return (
			<Page>
				<PageHeader title="Error" />
				<ErrorAlert message="Worker ID is required" onDismiss={() => navigate('/workers')} />
			</Page>
		);
	}

	if (isLoading) {
		return (
			<Page>
				<PageHeader title="Loading Worker..." />
				<div className="flex h-96 items-center justify-center">
					<LoadingSpinner />
				</div>
			</Page>
		);
	}

	if (isError || !worker) {
		return (
			<Page>
				<PageHeader title="Error" />
				<ErrorAlert message={error?.message || 'Worker not found'} onDismiss={() => navigate('/workers')} />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title={worker.name || worker.workerId}
				action={
					<Button variant="outline" size="sm" onClick={() => navigate(`/workers/${workerId}`)}>
						Split View
					</Button>
				}
			/>

			{/* Metrics always visible at top */}
			<div className="mb-4">
				<WorkerMetricsGrid worker={worker} />
			</div>

			{/* Full-width tabs */}
			<TabsWithUrlState paramKey="tab" defaultValue="tasks" groupId="worker">
				<TabsList>
					<TabsTrigger value="tasks">Task History</TabsTrigger>
					<TabsTrigger value="flows">Flows</TabsTrigger>
					<TabsTrigger value="info">Info</TabsTrigger>
				</TabsList>
				<TabsContent value="tasks">
					<WorkerTaskHistoryTable workerId={workerId} />
				</TabsContent>
				<TabsContent value="flows">
					<WorkerFlowsList workerId={workerId} />
				</TabsContent>
				<TabsContent value="info">
					<WorkerInfoPanel worker={worker} onRename={refetch} />
				</TabsContent>
			</TabsWithUrlState>
		</Page>
	);
}
