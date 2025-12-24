import { useCallback, useEffect, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import type { WorkspacesData } from '@shared/api/workspaces.contract';

import { type WebSocketMessage, useOrchestratorWebSocket } from '@/app/hooks/useOrchestratorWebSocket';

import { workspacesService } from './WorkspacesService';

/**
 * ===========================================================================================
 * USE WORKSPACES HOOK
 * ===========================================================================================
 *
 * Custom hook for managing workspaces data fetching and state.
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

export interface UseWorkspacesParams {
	enabled?: boolean;
	pollInterval?: number; // milliseconds
	useWebSocket?: boolean; // default true
}

export interface UseWorkspacesResult {
	data: WorkspacesData | null;
	loading: boolean;
	error: string | null;
	wsConnected: boolean;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useWorkspaces({
	enabled = true,
	pollInterval,
	useWebSocket = true,
}: UseWorkspacesParams = {}): UseWorkspacesResult {
	const [data, setData] = useState<WorkspacesData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	/**
	 * WebSocket connection for real-time updates
	 */
	const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
		// Validate that the message contains WorkspacesData structure
		const isValidWorkspacesData = (data: unknown): data is WorkspacesData => {
			if (!data || typeof data !== 'object') return false;
			const obj = data as Record<string, unknown>;
			return (
				typeof obj.timestamp === 'string' &&
				obj.summary !== undefined &&
				typeof obj.summary === 'object' &&
				Array.isArray(obj.workspaces)
			);
		};

		// Handle state_update messages
		if (message.type === 'state_update') {
			console.log('[useWorkspaces] Received state_update via WebSocket');
			if (isValidWorkspacesData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				// Generic state_update not relevant to workspaces - ignore
				console.log('[useWorkspaces] state_update does not contain workspaces data - ignoring');
			}
		}
		// Handle snapshot messages (full state)
		else if (message.type === 'snapshot') {
			console.log('[useWorkspaces] Received snapshot via WebSocket');
			if (isValidWorkspacesData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useWorkspaces] snapshot does not contain workspaces data - ignoring');
			}
		}
		// Handle error messages
		else if (message.type === 'error') {
			console.error('[useWorkspaces] Received error via WebSocket:', message);
			const errorMessage = (message.message as string) || 'WebSocket error received';
			setError(errorMessage);
		}
	}, []);

	const { isConnected: wsConnected } = useOrchestratorWebSocket({
		enabled: enabled && useWebSocket,
		onMessage: handleWebSocketMessage,
	});

	// Fetch workspaces data
	const fetchWorkspaces = useCallback(
		async (signal: AbortSignal) => {
			try {
				// Only show loading on initial load
				if (isInitialLoad) {
					setLoading(true);
				}

				const workspacesData = await workspacesService.getWorkspaces();

				if (!signal.aborted) {
					setData(workspacesData);
					setError(null);
					setIsInitialLoad(false);
				}
			} catch (err) {
				if (!signal.aborted) {
					const message = err instanceof Error ? err.message : 'Failed to load workspaces';
					setError(message);
					console.error('[useWorkspaces] Error caught:', err);
					console.error('Error loading workspaces:', err);
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
			await fetchWorkspaces(signal);
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

		console.log('[useWorkspaces] Starting polling (WebSocket disconnected)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchWorkspaces(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useWorkspaces] Stopping polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchWorkspaces, wsConnected]);

	// Manual refresh
	const refresh = useCallback(async () => {
		const controller = new AbortController();
		await fetchWorkspaces(controller.signal);
	}, [fetchWorkspaces]);

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
