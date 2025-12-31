import { useEffect, useState } from 'react';

import type { Task } from '@shared/api/tasks.contract';

import { tasksApi } from '../tasks.api';

interface UseTaskState {
	data: Task | null;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
}

/**
 * Hook for fetching a single task by ID
 */
export function useTask(taskId: string): UseTaskState {
	const [data, setData] = useState<Task | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

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

	return {
		data,
		isLoading,
		isError: error !== null,
		error,
	};
}
