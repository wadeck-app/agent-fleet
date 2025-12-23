import { useState } from 'react';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { RefreshCw } from 'lucide-react';

import { WorkspacesTable } from './WorkspacesTable';
import { useWorkspaces } from './useWorkspaces';

/**
 * ===========================================================================================
 * WORKSPACES PAGE - Workspaces Management
 * ===========================================================================================
 *
 * Displays list of workspaces with their status and details:
 * - Summary stats (total, active, locked, cleaning, errors)
 * - Workspaces table with path, mode, status, git branch, tasks count
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

export function WorkspacesPage() {
	const { data, loading, error, refresh, clearError } = useWorkspaces({ pollInterval: 5000 });
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
		return <LoadingState message="Loading workspaces..." size="large" />;
	}

	return (
		<Page>
			<PageHeader
				title="Workspaces"
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

			{/* Workspaces Content */}
			{data && (
				<div className="space-y-6">
					{/* Summary Stats */}
					<div
						className={`
        grid gap-4
        md:grid-cols-5
      `}
					>
						<div
							className={`
        rounded-lg border bg-card p-4 text-card-foreground shadow-sm
      `}
						>
							<div className="text-sm font-medium text-muted-foreground">Total</div>
							<div className="text-2xl font-bold">{data.summary.total}</div>
						</div>
						<div
							className={`
        rounded-lg border bg-card p-4 text-card-foreground shadow-sm
      `}
						>
							<div className="text-sm font-medium text-muted-foreground">Active</div>
							<div
								className={`
          text-2xl font-bold text-green-600
          dark:text-green-400
        `}
							>
								{data.summary.active}
							</div>
						</div>
						<div
							className={`
        rounded-lg border bg-card p-4 text-card-foreground shadow-sm
      `}
						>
							<div className="text-sm font-medium text-muted-foreground">Locked</div>
							<div
								className={`
          text-2xl font-bold text-yellow-600
          dark:text-yellow-400
        `}
							>
								{data.summary.locked}
							</div>
						</div>
						<div
							className={`
        rounded-lg border bg-card p-4 text-card-foreground shadow-sm
      `}
						>
							<div className="text-sm font-medium text-muted-foreground">Cleaning</div>
							<div
								className={`
          text-2xl font-bold text-blue-600
          dark:text-blue-400
        `}
							>
								{data.summary.cleaning}
							</div>
						</div>
						<div
							className={`
        rounded-lg border bg-card p-4 text-card-foreground shadow-sm
      `}
						>
							<div className="text-sm font-medium text-muted-foreground">Errors</div>
							<div
								className={`
          text-2xl font-bold text-red-600
          dark:text-red-400
        `}
							>
								{data.summary.errorCount}
							</div>
						</div>
					</div>

					{/* Workspaces Table */}
					<WorkspacesTable workspaces={data.workspaces} />
				</div>
			)}
		</Page>
	);
}
