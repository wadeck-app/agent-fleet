import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyState } from '@framework/components/feedback/EmptyState';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { ProjectBoardData } from '@shared/api/projects.contract';
import type { TaskStatus } from '@shared/api/tasks.contract';
import { B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@shared/transport';
import { ArrowLeft } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { tasksApi } from '../tasks/tasks.api';
import { BoardView } from './board/BoardView';
import { projectsApi } from './projects.api';

/**
 * ===========================================================================================
 * PROJECT BOARD PAGE
 * ===========================================================================================
 *
 * Kanban-style board view for tasks in a project.
 * - Displays tasks grouped by status in columns
 * - Drag-and-drop to change task status
 * - Real-time updates via WebSocket events
 * - Optimistic updates with error handling
 *
 * ===========================================================================================
 */
export function ProjectBoardPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const navigate = useNavigate();
	const { showToast } = useToast();

	const [boardData, setBoardData] = useState<ProjectBoardData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchBoardData = useCallback(async () => {
		if (!projectId) return;

		try {
			setError(null);
			const data = await projectsApi.getProjectBoard(projectId);
			setBoardData(data);
		} catch (err) {
			console.error('[ProjectBoardPage] Failed to fetch board data:', err);
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchBoardData();
	}, [fetchBoardData]);

	// Real-time updates: refresh board when tasks change
	useRealtimeRefresh({
		events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
		onEvent: fetchBoardData,
		logPrefix: 'ProjectBoardPage',
	});

	const handleTaskStatusChange = async (taskId: string, newStatus: TaskStatus) => {
		if (!boardData) return;

		// Optimistic update: immediately update local state
		const previousBoardData = { ...boardData };

		try {
			// Find the task and update its status locally
			const allTasks = Object.values(boardData.tasksByStatus).flat();
			const task = allTasks.find(t => t.id === taskId);

			if (task) {
				// Remove task from old status column
				const oldStatus = task.status;
				boardData.tasksByStatus[oldStatus] = (boardData.tasksByStatus[oldStatus] || []).filter(
					t => t.id !== taskId
				);

				// Add task to new status column
				task.status = newStatus;
				boardData.tasksByStatus[newStatus] = [...(boardData.tasksByStatus[newStatus] || []), task];

				setBoardData({ ...boardData });
			}

			// Update task status via API
			await tasksApi.updateTaskStatus(taskId, newStatus);

			showToast('Task status updated successfully', 'success');
		} catch (err) {
			console.error('[ProjectBoardPage] Failed to update task status:', err);

			// Revert optimistic update on error
			setBoardData(previousBoardData);

			showToast('Failed to update task status', 'error');
		}
	};

	const handleBackClick = () => {
		navigate('/projects');
	};

	if (isLoading) {
		return (
			<Page>
				<PageHeader title="Loading Board..." />
				<LoadingState message="Loading project board..." />
			</Page>
		);
	}

	if (error) {
		return (
			<Page>
				<PageHeader title="Error" />
				<EmptyState
					title="Failed to load board"
					description={error}
					action={{
						label: 'Retry',
						onClick: fetchBoardData,
						variant: 'default',
					}}
				/>
			</Page>
		);
	}

	if (!boardData) {
		return (
			<Page>
				<PageHeader title="Project Not Found" />
				<EmptyState
					title="Project not found"
					description="The project you are looking for does not exist."
					action={{
						label: 'Back to Projects',
						onClick: handleBackClick,
						variant: 'default',
					}}
				/>
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title={`${boardData.projectName} - Board`}
				action={
					<Button onClick={handleBackClick} variant="outline">
						<ArrowLeft className="mr-2 size-4" />
						Back to Projects
					</Button>
				}
			/>

			<div className="flex-1 overflow-hidden">
				<BoardView tasksByStatus={boardData.tasksByStatus} onTaskStatusChange={handleTaskStatusChange} />
			</div>
		</Page>
	);
}
