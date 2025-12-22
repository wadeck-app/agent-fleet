import { useState } from 'react';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { RefreshCw } from 'lucide-react';

import { WorkersTable } from './WorkersTable';
import { useWorkers } from './useWorkers';

/**
 * ===========================================================================================
 * WORKERS PAGE - Workers Management
 * ===========================================================================================
 *
 * Displays list of workers with their status and details:
 * - Summary stats (connected, idle, busy, avg load)
 * - Workers table with ID, type, status, current task
 * - Real-time updates
 *
 * Features:
 * - Auto-refresh every 5 seconds
 * - Manual refresh capability
 * - Loading and error states
 * - Responsive layout
 *
 * ===========================================================================================
 */

export function WorkersPage() {
	const { data, loading, error, refresh, clearError } = useWorkers({ pollInterval: 5000 });
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
		return <LoadingState message="Loading workers..." size="large" />;
	}

	return (
		<Page>
			<PageHeader
				title="Workers"
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

			{/* Workers Content */}
			{data && (
				<div className="space-y-6">
					{/* Summary Stats */}
					<div
						className={`
        grid gap-4
        md:grid-cols-5
      `}
					>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Total</div>
							<div className="text-2xl font-bold">{data.summary.total}</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Connected</div>
							<div
								className={`
          text-2xl font-bold text-green-600
          dark:text-green-400
        `}
							>
								{data.summary.connected}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Idle</div>
							<div
								className={`
          text-2xl font-bold text-blue-600
          dark:text-blue-400
        `}
							>
								{data.summary.idle}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Busy</div>
							<div
								className={`
          text-2xl font-bold text-orange-600
          dark:text-orange-400
        `}
							>
								{data.summary.busy}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Avg Load</div>
							<div className="text-2xl font-bold">{data.summary.avgLoad}%</div>
						</div>
					</div>

					{/* Workers Table */}
					<WorkersTable workers={data.workers} />
				</div>
			)}
		</Page>
	);
}
