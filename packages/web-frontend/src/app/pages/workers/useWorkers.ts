import { useCallback, useEffect, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import type { WorkersData } from '@shared/api/workers.contract';

import { type WebSocketMessage, useOrchestratorWebSocket } from '@/app/hooks/useOrchestratorWebSocket';

import { workersService } from './WorkersService';

/**
 * ===========================================================================================
 * USE WORKERS HOOK
 * ===========================================================================================
 *
 * Custom hook for managing workers data fetching and state.
 *
 * Features:
 * - Auto-fetch on mount
 * - Real-time updates via WebSocket
 * - Fallback to polling when WebSocket disconnected
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * ===========================================================================================
 */

export interface UseWorkersParams {
	enabled?: boolean;
	pollInterval?: number; // milliseconds
	useWebSocket?: boolean; // default true
}

export interface UseWorkersResult {
	data: WorkersData | null;
	loading: boolean;
	error: string | null;
	wsConnected: boolean;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useWorkers({
	enabled = true,
	pollInterval,
	useWebSocket = true,
}: UseWorkersParams = {}): UseWorkersResult {
	const [data, setData] = useState<WorkersData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	/**
	 * WebSocket connection for real-time updates
	 */
	const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
		// Validate that the message contains WorkersData structure
		const isValidWorkersData = (data: unknown): data is WorkersData => {
			if (!data || typeof data !== 'object') return false;
			const obj = data as Record<string, unknown>;
			return (
				typeof obj.timestamp === 'string' &&
				obj.summary !== undefined &&
				typeof obj.summary === 'object' &&
				obj.summary !== null &&
				typeof (obj.summary as Record<string, unknown>).total === 'number' &&
				typeof (obj.summary as Record<string, unknown>).connected === 'number' &&
				typeof (obj.summary as Record<string, unknown>).disconnected === 'number' &&
				typeof (obj.summary as Record<string, unknown>).idle === 'number' &&
				typeof (obj.summary as Record<string, unknown>).busy === 'number' &&
				typeof (obj.summary as Record<string, unknown>).avgLoad === 'number' &&
				Array.isArray(obj.workers)
			);
		};

		// Handle state_update messages
		if (message.type === 'state_update') {
			console.log('[useWorkers] Received state_update via WebSocket');
			if (isValidWorkersData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useWorkers] state_update does not contain workers data - ignoring');
			}
		}
		// Handle snapshot messages (full state)
		else if (message.type === 'snapshot') {
			console.log('[useWorkers] Received snapshot via WebSocket');
			if (isValidWorkersData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useWorkers] snapshot does not contain workers data - ignoring');
			}
		}
		// Handle error messages
		else if (message.type === 'error') {
			console.error('[useWorkers] Received error via WebSocket:', message);
			const errorMessage = (message.message as string) || 'WebSocket error received';
			setError(errorMessage);
		}
	}, []);

	const { isConnected: wsConnected } = useOrchestratorWebSocket({
		enabled: enabled && useWebSocket,
		onMessage: handleWebSocketMessage,
	});

	// Fetch workers data
	const fetchWorkers = useCallback(
		async (signal: AbortSignal) => {
			try {
				// Only show loading on initial load
				if (isInitialLoad) {
					setLoading(true);
				}

				const workersData = await workersService.getWorkers();

				if (!signal.aborted) {
					setData(workersData);
					setError(null);
					setIsInitialLoad(false);
				}
			} catch (err) {
				if (!signal.aborted) {
					const message = err instanceof Error ? err.message : 'Failed to load workers';
					setError(message);
					console.error('[useWorkers] Error caught:', err);
					console.error('Error loading workers:', err);
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[isInitialLoad]
	);

	// Initial fetch on mount
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetchWorkers(signal);
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

		console.log('[useWorkers] Starting polling (WebSocket disconnected)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchWorkers(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useWorkers] Stopping polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchWorkers, wsConnected]);

	// Manual refresh
	const refresh = useCallback(async () => {
		const controller = new AbortController();
		await fetchWorkers(controller.signal);
	}, [fetchWorkers]);

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
