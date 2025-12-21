import type { TasksData, TasksQuery } from '@shared';
import { useState, useCallback, useEffect } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';

import { tasksService } from './TasksService';

/**
 * ===========================================================================================
 * USE TASKS HOOK
 * ===========================================================================================
 *
 * Custom hook for managing tasks data fetching and state.
 *
 * Features:
 * - Auto-fetch on mount
 * - Optional polling
 * - Optional filtering (status, workerId, priority)
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * ===========================================================================================
 */

export interface UseTasksParams {
	enabled?: boolean;
	pollInterval?: number; // milliseconds
	filters?: TasksQuery; // status, workerId, priority
}

export interface UseTasksResult {
	data: TasksData | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useTasks({ enabled = true, pollInterval, filters }: UseTasksParams = {}): UseTasksResult {
	const [data, setData] = useState<TasksData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Fetch tasks data
	const fetchTasks = useCallback(
		async (signal: AbortSignal) => {
			try {
				// Only show loading on initial load
				if (isInitialLoad) {
					setLoading(true);
				}

				const tasksData = await tasksService.getTasks(filters);

				if (!signal.aborted) {
					setData(tasksData);
					setError(null);
					setIsInitialLoad(false);
				}
			} catch (err) {
				if (!signal.aborted) {
					const message = err instanceof Error ? err.message : 'Failed to load tasks';
					setError(message);
					console.error('[useTasks] Error caught:', err);
					console.error('Error loading tasks:', err);
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[isInitialLoad, filters]
	);

	// Initial fetch on mount
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetchTasks(signal);
		},
		[enabled] // Only re-run if enabled changes
	);

	// Polling effect - separate from initial fetch to avoid re-creating intervals
	useEffect(() => {
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad) return;

		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchTasks(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchTasks]);

	// Manual refresh
	const refresh = useCallback(async () => {
		const controller = new AbortController();
		await fetchTasks(controller.signal);
	}, [fetchTasks]);

	// Clear error
	const clearError = useCallback(() => {
		setError(null);
	}, []);

	return {
		data,
		loading,
		error,
		refresh,
		clearError,
	};
}
