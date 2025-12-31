import { useState } from 'react';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { RefreshCw } from 'lucide-react';

import { QuickActions } from './QuickActions';
import { RecentActivityCard } from './RecentActivityCard';
import { StatusCard } from './StatusCard';
import { TasksCard } from './TasksCard';
import { ThroughputCard } from './ThroughputCard';
import { WorkersCard } from './WorkersCard';
import { useDashboard } from './useDashboard';

/**
 * ===========================================================================================
 * DASHBOARD PAGE - Orchestrator Metrics Overview
 * ===========================================================================================
 *
 * Displays real-time orchestrator metrics:
 * - Orchestrator status and uptime
 * - Worker statistics (connected, idle, busy)
 * - Task distribution (total, active, review, done, blocked, failed)
 * - Throughput metrics (tasks/hour, success rate, avg duration)
 * - Recent activity feed (last 10 events)
 * - Quick actions (navigation to other pages)
 *
 * Features:
 * - Auto-refresh every 5 seconds
 * - Manual refresh capability
 * - Loading and error states
 * - Responsive layout
 *
 * ===========================================================================================
 */

export function DashboardPage() {
	const { data, loading, error, refresh, clearError } = useDashboard();
	const [isRefreshing, setIsRefreshing] = useState(false);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await refresh();
		} finally {
			setIsRefreshing(false);
		}
	};

	// Show loading state on initial load
	if (loading && !data) {
		return <LoadingState message="Loading dashboard..." size="large" />;
	}

	return (
		<Page>
			<PageHeader
				title="Dashboard"
				action={
					<Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
						<RefreshCw
							className={`
         mr-2 size-4
         ${isRefreshing ? 'animate-spin' : ''}
       `}
						/>
						Refresh
					</Button>
				}
			/>

			{/* Error Alert */}
			{error && (
				<div className="mb-6">
					<ErrorAlert message={error} onDismiss={clearError} />
				</div>
			)}

			{/* Dashboard Content */}
			{data && (
				<div className="space-y-6">
					{/* Top Row: Status, Workers, Tasks */}
					<div
						className={`
        grid gap-6
        md:grid-cols-3
      `}
					>
						<StatusCard
							status={data.orchestrator.status}
							uptime={data.orchestrator.uptime}
							version={data.orchestrator.version}
						/>
						<WorkersCard
							connected={data.workers.connected}
							idle={data.workers.idle}
							busy={data.workers.busy}
						/>
						<TasksCard
							total={data.tasks.total}
							active={data.tasks.active}
							review={data.tasks.review}
							done={data.tasks.done}
							blocked={data.tasks.blocked}
							failed={data.tasks.failed}
						/>
					</div>

					{/* Second Row: Throughput */}
					<div
						className={`
        grid gap-6
        md:grid-cols-3
      `}
					>
						<ThroughputCard
							tasksPerHour={data.throughput.tasksPerHour}
							successRate={data.throughput.successRate}
							avgTaskDuration={data.throughput.avgTaskDuration}
						/>
					</div>

					{/* Third Row: Recent Activity */}
					<RecentActivityCard activities={data.recentActivity} />

					{/* Quick Actions */}
					<div className="border-t pt-6">
						<QuickActions reviewQueueCount={data.tasks.review} />
					</div>
				</div>
			)}
		</Page>
	);
}
