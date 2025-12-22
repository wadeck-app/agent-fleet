import { useState } from 'react';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import type { TaskPriority, TaskStatus } from '@shared';
import { RefreshCw } from 'lucide-react';

import { TaskFilters } from './TaskFilters';
import { TasksTable } from './TasksTable';
import { useTasks } from './useTasks';

/**
 * ===========================================================================================
 * TASKS PAGE - Tasks Management
 * ===========================================================================================
 *
 * Displays list of tasks with filtering capabilities:
 * - Summary stats (total, by status, by priority)
 * - Tasks table with ID, description, status, priority, assigned worker
 * - Filter controls (status, priority, worker ID)
 * - Real-time updates
 *
 * Features:
 * - Auto-refresh every 5 seconds
 * - Manual refresh capability
 * - Loading and error states
 * - Responsive layout
 * - Filter by status, priority, and worker ID
 *
 * ===========================================================================================
 */

export function TasksPage() {
	const [status, setStatus] = useState<TaskStatus | undefined>();
	const [priority, setPriority] = useState<TaskPriority | undefined>();
	const [workerId, setWorkerId] = useState<string | undefined>();

	const { data, loading, error, refresh, clearError } = useTasks({
		pollInterval: 5000,
		filters: {
			status,
			priority,
			workerId,
		},
	});

	const [isRefreshing, setIsRefreshing] = useState(false);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await refresh();
		} finally {
			setIsRefreshing(false);
		}
	};

	const handleClearFilters = () => {
		setStatus(undefined);
		setPriority(undefined);
		setWorkerId(undefined);
	};

	// Show loading state on initial load
	if (loading && !data) {
		return <LoadingState message="Loading tasks..." size="large" />;
	}

	return (
		<Page>
			<PageHeader
				title="Tasks"
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

			{/* Tasks Content */}
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
							<div className="text-sm font-medium text-muted-foreground">Total Tasks</div>
							<div className="text-2xl font-bold">{data.summary.total}</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">In Progress</div>
							<div
								className={`
          text-2xl font-bold text-blue-600
          dark:text-blue-400
        `}
							>
								{data.summary.byStatus.in_progress || 0}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Review</div>
							<div
								className={`
          text-2xl font-bold text-purple-600
          dark:text-purple-400
        `}
							>
								{data.summary.byStatus.review || 0}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Completed</div>
							<div
								className={`
          text-2xl font-bold text-green-600
          dark:text-green-400
        `}
							>
								{(data.summary.byStatus.approved || 0) + (data.summary.byStatus.merged || 0)}
							</div>
						</div>
						<div className={`rounded-lg border bg-card p-4 text-card-foreground shadow-sm`}>
							<div className="text-sm font-medium text-muted-foreground">Blocked</div>
							<div
								className={`
          text-2xl font-bold text-red-600
          dark:text-red-400
        `}
							>
								{data.summary.byStatus.blocked || 0}
							</div>
						</div>
					</div>

					{/* Filters */}
					<TaskFilters
						status={status}
						priority={priority}
						workerId={workerId}
						onStatusChange={setStatus}
						onPriorityChange={setPriority}
						onWorkerIdChange={setWorkerId}
						onClearFilters={handleClearFilters}
					/>

					{/* Tasks Table */}
					<TasksTable tasks={data.tasks} />
				</div>
			)}
		</Page>
	);
}
