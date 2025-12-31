import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import type { TasksData, TasksQuery } from '@shared/api/tasks.contract';
import { B2F_TASKS_UPDATED } from '@shared/transport';

import { useTransport } from '@/transport';

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
 * - Real-time updates via Backend WebSocket (with server-side filtering)
 * - Fallback to polling when WebSocket disconnected
 * - Server-side filtering (status, workerId, priority)
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * Migration Notes:
 * - Replaced direct orchestrator WebSocket with backend WebSocket
 * - Now uses B2F_TASKS_UPDATED event instead of state_update/snapshot
 * - Server-side filtering reduces bandwidth (only matching tasks sent)
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

export function useTasks({
	enabled = true,
	pollInterval,
	filters,
	useWebSocket = true,
}: UseTasksParams = {}): UseTasksResult {
	const [data, setData] = useState<TasksData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const isMountedRef = useRef(true);

	// Transport connection for backend WebSocket and connection state
	const { transport, connectionState } = useTransport();

	// Check if WebSocket is connected (convenience for return value)
	const wsConnected = connectionState === 'connected';

	// Fetch tasks data (defined early so it can be used by handleTasksEvent)
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

	/**
	 * Handle tasks update event from backend WebSocket
	 * B2F_TASKS_UPDATED sends empty payload as invalidation signal
	 * We need to refresh the data when this event arrives
	 */
	const handleTasksEvent = useCallback(() => {
		if (isMountedRef.current) {
			console.log('[useTasks] Received tasks update via Backend WebSocket - refreshing data');
			// Trigger a refresh instead of trying to use event data (which is empty)
			const controller = new AbortController();
			fetchTasks(controller.signal);
		}
	}, [fetchTasks]);

	/**
	 * Subscribe to tasks events via backend WebSocket WITH server-side filters
	 * Backend will only send tasks matching the filters (workerId, status, priority)
	 * This dramatically reduces bandwidth when filtering by specific worker
	 */
	useEffect(() => {
		if (!enabled || !useWebSocket) return;

		// Build filters for server-side filtering
		const subscriptionFilters: Record<string, unknown> = {};
		if (filters?.workerId) {
			subscriptionFilters.workerId = filters.workerId;
		}
		if (filters?.status) {
			subscriptionFilters.status = filters.status;
		}
		if (filters?.priority) {
			subscriptionFilters.priority = filters.priority;
		}

		console.log('[useTasks] Subscribing to tasks updates with filters:', subscriptionFilters);

		// Subscribe with server-side filters
		const unsubscribe = transport.subscribe(
			B2F_TASKS_UPDATED,
			handleTasksEvent,
			Object.keys(subscriptionFilters).length > 0 ? subscriptionFilters : undefined
		);

		return () => {
			console.log('[useTasks] Unsubscribing from tasks updates');
			unsubscribe();
		};
	}, [enabled, useWebSocket, transport, handleTasksEvent, filters?.workerId, filters?.status, filters?.priority]);

	// Track mount state
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	// Initial fetch on mount
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetchTasks(signal);
		},
		[enabled] // Only re-run if enabled changes
	);

	// Polling effect - separate from initial fetch to avoid re-creating intervals
	// Only active when WebSocket has failed or is not used (fallback mode)
	// Does NOT poll during 'reconnecting' state to respect exponential backoff
	useEffect(() => {
		// Don't poll if:
		// - Not enabled
		// - No poll interval set
		// - Still doing initial load
		// - WebSocket is not used
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad || !useWebSocket) {
			return;
		}

		// Don't poll if WebSocket is connected or trying to reconnect
		// Only poll if WebSocket has given up ('error') or is disabled ('disconnected' without reconnect)
		if (connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'reconnecting') {
			console.log(`[useTasks] Waiting for WebSocket (state: ${connectionState})`);
			return;
		}

		console.log('[useTasks] Starting REST polling (WebSocket failed or unavailable)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchTasks(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useTasks] Stopping REST polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, useWebSocket, connectionState, fetchTasks]);

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
