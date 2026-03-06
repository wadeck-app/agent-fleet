import { useCallback, useEffect, useState } from 'react';

import { B2F_TASKS_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { tasksApi } from '../tasks/tasks.api';

interface UseTriggeredTasksCountState {
	count: number;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching and tracking the triggered tasks count for a specific ticket.
 * Automatically refreshes when tasks are updated via WebSocket events.
 */
export function useTriggeredTasksCount(ticketId: string): UseTriggeredTasksCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Fetch tasks count
	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await tasksApi.getTasksList({ ticketId, pageSize: 1 });
			setCount(response.pagination?.total || 0);
		} catch (err) {
			console.error('Failed to fetch tasks count:', err);
			setError(err instanceof Error ? err : new Error('Failed to fetch tasks count'));
		} finally {
			setLoading(false);
		}
	}, [ticketId]);

	// Initial load
	useEffect(() => {
		refresh();
	}, [refresh]);

	// Subscribe to tasks updates (no filters needed, will refresh for any task update)
	useRealtimeRefresh({
		events: [B2F_TASKS_UPDATED],
		onEvent: refresh,
		logPrefix: 'useTriggeredTasksCount',
	});

	return {
		count,
		loading,
		error,
		refresh,
	};
}
