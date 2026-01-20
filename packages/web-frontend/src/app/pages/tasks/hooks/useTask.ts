import { useCallback, useEffect, useState } from 'react';

import type { Task } from '@shared/api/tasks.contract';

import { tasksApi } from '../tasks.api';

interface UseTaskState {
	data: Task | null;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Hook for fetching a single task by ID with real-time update support
 */
export function useTask(taskId: string): UseTaskState {
	const [data, setData] = useState<Task | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Initial load
	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);

				const task = await tasksApi.getTaskById(taskId);

				if (!abortController.signal.aborted) {
					setData(task);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch task'));
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
	}, [taskId]);

	// Silent refetch (for real-time updates) - doesn't show loading spinner
	const refetch = useCallback(async () => {
		try {
			const task = await tasksApi.getTaskById(taskId);
			setData(task);
		} catch (err) {
			console.error('Failed to refetch task:', err);
			// Silently fail - don't disrupt UX for background updates
		}
	}, [taskId]);

	return {
		data,
		isLoading,
		isError: error !== null,
		error,
		refetch,
	};
}
