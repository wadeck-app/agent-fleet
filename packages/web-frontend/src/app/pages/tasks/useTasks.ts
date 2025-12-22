import type { TasksData, TasksQuery } from '@shared';
import { useState, useCallback, useEffect } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';

import { useOrchestratorWebSocket, type WebSocketMessage } from '../../hooks/useOrchestratorWebSocket';
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
 * - Real-time updates via WebSocket
 * - Fallback to polling when WebSocket disconnected
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
	useWebSocket?: boolean; // default true
}

export interface UseTasksResult {
	data: TasksData | null;
	loading: boolean;
	error: string | null;
	wsConnected: boolean;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useTasks({ enabled = true, pollInterval, filters, useWebSocket = true }: UseTasksParams = {}): UseTasksResult {
	const [data, setData] = useState<TasksData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	/**
	 * WebSocket connection for real-time updates
	 */
	const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
		// Validate that the message contains TasksData structure
		const isValidTasksData = (data: unknown): data is TasksData => {
			if (!data || typeof data !== 'object') return false;
			const obj = data as Record<string, unknown>;
			return (
				typeof obj.timestamp === 'string' &&
				obj.summary !== undefined &&
				typeof obj.summary === 'object' &&
				obj.summary !== null &&
				typeof (obj.summary as Record<string, unknown>).total === 'number' &&
				typeof (obj.summary as Record<string, unknown>).byStatus === 'object' &&
				typeof (obj.summary as Record<string, unknown>).byPriority === 'object' &&
				Array.isArray(obj.tasks)
			);
		};

		// Handle state_update messages
		if (message.type === 'state_update') {
			console.log('[useTasks] Received state_update via WebSocket');
			if (isValidTasksData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useTasks] state_update does not contain tasks data - ignoring');
			}
		}
		// Handle snapshot messages (full state)
		else if (message.type === 'snapshot') {
			console.log('[useTasks] Received snapshot via WebSocket');
			if (isValidTasksData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useTasks] snapshot does not contain tasks data - ignoring');
			}
		}
		// Handle error messages
		else if (message.type === 'error') {
			console.error('[useTasks] Received error via WebSocket:', message);
			const errorMessage = (message.message as string) || 'WebSocket error received';
			setError(errorMessage);
		}
	}, []);

	const { isConnected: wsConnected } = useOrchestratorWebSocket({
		enabled: enabled && useWebSocket,
		onMessage: handleWebSocketMessage,
	});

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
	// Only active when WebSocket is NOT connected (fallback mode)
	useEffect(() => {
		// Don't poll if:
		// - Not enabled
		// - No poll interval set
		// - Still doing initial load
		// - WebSocket is connected (real-time updates active)
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad || wsConnected) {
			return;
		}

		console.log('[useTasks] Starting polling (WebSocket disconnected)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchTasks(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useTasks] Stopping polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchTasks, wsConnected]);

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
		wsConnected,
		refresh,
		clearError,
	};
}
