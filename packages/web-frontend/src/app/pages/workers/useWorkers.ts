import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import type { Worker, WorkersData } from '@shared/api/workers.contract';
import { B2F_WORKERS_UPDATED, B2F_WORKER_UPDATED } from '@shared/transport';

import { useTransport } from '@/transport';

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
 * - Real-time updates via Backend WebSocket
 * - Fallback to polling when WebSocket disconnected
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * Migration Notes:
 * - Replaced direct orchestrator WebSocket with backend WebSocket
 * - Now uses B2F_WORKERS_UPDATED event instead of state_update/snapshot
 * - Type-safe data reception (no validation needed)
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
	const isMountedRef = useRef(true);

	// Transport connection for backend WebSocket and connection state
	const { transport, connectionState } = useTransport();

	/**
	 * Handle workers update event from backend WebSocket
	 * Type-safe - receives WorkersData directly (no validation needed)
	 */
	const handleWorkersEvent = useCallback((workersData: WorkersData) => {
		if (isMountedRef.current) {
			console.log('[useWorkers] Received workers update via Backend WebSocket');
			setData(workersData);
			setError(null);
		}
	}, []);

	/**
	 * Handle individual worker update event
	 * Updates a single worker in the list without full refresh
	 */
	const handleWorkerUpdateEvent = useCallback((updatedWorker: Worker) => {
		if (isMountedRef.current) {
			console.log('[useWorkers] Received individual worker update:', updatedWorker.workerId);
			// Use functional update to avoid depending on data object
			setData(prevData => {
				if (!prevData) return prevData;

				// Update the specific worker in the list
				const updatedWorkers = prevData.workers.map(w =>
					w.workerId === updatedWorker.workerId ? updatedWorker : w
				);

				return {
					...prevData,
					workers: updatedWorkers,
					timestamp: new Date().toISOString(),
				};
			});
			setError(null);
		}
	}, []);

	/**
	 * Subscribe to workers events via backend WebSocket
	 * - B2F_WORKERS_UPDATED: Full list updates (bulk changes)
	 * - B2F_WORKER_UPDATED: Individual worker updates (rename, etc.)
	 */
	useEffect(() => {
		if (!enabled || !useWebSocket) return;

		console.log('[useWorkers] Subscribing to workers updates');

		// Subscribe to bulk updates (all workers)
		const unsubscribeBulk = transport.subscribe(B2F_WORKERS_UPDATED, handleWorkersEvent);

		// Subscribe to individual worker updates
		const unsubscribeIndividual = transport.subscribe(B2F_WORKER_UPDATED, handleWorkerUpdateEvent);

		return () => {
			console.log('[useWorkers] Unsubscribing from workers updates');
			unsubscribeBulk();
			unsubscribeIndividual();
		};
	}, [enabled, useWebSocket, transport, handleWorkersEvent, handleWorkerUpdateEvent]);

	// Track mount state
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	// Check if WebSocket is connected (convenience for return value)
	const wsConnected = connectionState === 'connected';

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
			console.log(`[useWorkers] Waiting for WebSocket (state: ${connectionState})`);
			return;
		}

		console.log('[useWorkers] Starting REST polling (WebSocket failed or unavailable)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchWorkers(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useWorkers] Stopping REST polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, useWebSocket, connectionState, fetchWorkers]);

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
