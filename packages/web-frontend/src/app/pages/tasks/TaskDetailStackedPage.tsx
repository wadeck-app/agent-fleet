import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Button } from '@framework/components/primitives/Button';
import type { LogLevel } from '@shared/api/tasks.contract';
import { B2F_TASK_TRACE_UPDATED, B2F_TASK_UPDATED } from '@shared/transport';
import { ArrowLeft } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { TaskInfoCard } from './components/TaskInfoCard';
import { TaskLogsViewer } from './components/TaskLogsViewer';
import { useTask } from './hooks/useTask';
import { useTaskLogs } from './hooks/useTaskLogs';

/**
 * Task Detail Page - Stacked Layout (Variant A2)
 * Task info at top (collapsible), logs take full width below
 */
export function TaskDetailStackedPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const taskId = id!;

	// Fetch task details
	const {
		data: task,
		isLoading: isTaskLoading,
		isError: isTaskError,
		error: taskError,
		refetch: refetchTask,
	} = useTask(taskId);

	// Logs filtering state
	const [level, setLevel] = useState<LogLevel | undefined>(undefined);
	const [search, setSearch] = useState<string>('');

	// Fetch logs with pagination
	const {
		logs,
		total: _total,
		isRunning,
		isLoading: isLogsLoading,
		loadMore,
		hasMore,
		isLoadingMore,
		refetch,
		appendNewLogs,
	} = useTaskLogs({
		taskId,
		level,
		search,
		limit: 100,
	});

	// Subscribe to real-time trace updates for THIS task only (filtered by taskId)
	// Uses appendNewLogs for smooth incremental updates without full reload
	useRealtimeRefresh({
		events: [B2F_TASK_TRACE_UPDATED],
		onEvent: appendNewLogs,
		filters: { taskId }, // Server-side filter: only this task's trace updates
		logPrefix: 'TaskDetailStackedPage:traces',
	});

	// Subscribe to task status updates (e.g., completion, cancellation)
	// Also updates isRunning state by calling appendNewLogs
	useRealtimeRefresh({
		events: [B2F_TASK_UPDATED],
		onEvent: () => {
			refetchTask();
			appendNewLogs(); // Update isRunning state
		},
		filters: { taskId }, // Server-side filter: only this task's updates
		logPrefix: 'TaskDetailStackedPage:task',
	});

	if (isTaskLoading) {
		return (
			<Page>
				<PageHeader title="Loading Task..." />
				<div className="flex h-96 items-center justify-center">
					<LoadingSpinner />
				</div>
			</Page>
		);
	}

	if (isTaskError || !task) {
		return (
			<Page>
				<PageHeader title="Error" />
				<ErrorAlert message={taskError?.message || 'Task not found'} onDismiss={() => navigate('/tasks')} />
			</Page>
		);
	}

	return (
		<Page className="flex h-[calc(100vh-theme(spacing.16))] flex-col overflow-hidden">
			<PageHeader
				title={`Task #${task.id.substring(0, 8)}`}
				action={
					<Button variant="outline" size="sm" onClick={() => navigate('/tasks')}>
						<ArrowLeft className="mr-2 size-4" />
						Back to Tasks
					</Button>
				}
			/>

			{/* Task Info Card (collapsible) */}
			<div className="mb-4 shrink-0">
				<TaskInfoCard task={task} collapsible defaultOpen={true} />
			</div>

			{/* Logs Viewer - fills remaining space, single scroll inside */}
			<div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
				<TaskLogsViewer
					logs={logs}
					isRunning={isRunning}
					isLoading={isLogsLoading}
					hasMore={hasMore}
					isLoadingMore={isLoadingMore}
					onLoadMore={loadMore}
					onRefresh={refetch}
					level={level}
					search={search}
					onLevelChange={setLevel}
					onSearchChange={setSearch}
				/>
			</div>
		</Page>
	);
}
