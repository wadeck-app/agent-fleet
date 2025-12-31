import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Button } from '@framework/components/primitives/Button';
import type { LogLevel } from '@shared/api/tasks.contract';
import { ArrowLeft } from 'lucide-react';

import { TaskInfoPanel } from './components/TaskInfoPanel';
import { TaskLogsViewer } from './components/TaskLogsViewer';
import { useTask } from './hooks/useTask';
import { useTaskLogs } from './hooks/useTaskLogs';

/**
 * Task Detail Page - Split Layout (Variant A1)
 * Side-by-side layout with task info on left, logs on right
 */
export function TaskDetailSplitPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const taskId = id!;

	// Fetch task details
	const { data: task, isLoading: isTaskLoading, isError: isTaskError, error: taskError } = useTask(taskId);

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
	} = useTaskLogs({
		taskId,
		level,
		search,
		limit: 100,
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
				<ErrorAlert message={taskError?.message || 'Task not found'} onDismiss={() => navigate('/tasks2')} />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title={`Task #${task.id.substring(0, 8)}`}
				action={
					<Button variant="outline" size="sm" onClick={() => navigate('/tasks2')}>
						<ArrowLeft className="mr-2 size-4" />
						Back to Tasks
					</Button>
				}
			/>

			<div className="grid h-[calc(100vh-200px)] grid-cols-[300px_1fr] gap-4">
				{/* Left: Task Info Panel */}
				<TaskInfoPanel task={task} />

				{/* Right: Logs Viewer */}
				<div className="overflow-hidden rounded-lg border border-border bg-card">
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
			</div>
		</Page>
	);
}
