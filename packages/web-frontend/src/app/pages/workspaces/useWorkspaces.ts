import type { WorkspacesData } from '@shared';
import { useState, useCallback, useEffect } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';

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
 * - Optional polling
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * ===========================================================================================
 */

export interface UseWorkspacesParams {
	enabled?: boolean;
	pollInterval?: number; // milliseconds
}

export interface UseWorkspacesResult {
	data: WorkspacesData | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useWorkspaces({ enabled = true, pollInterval }: UseWorkspacesParams = {}): UseWorkspacesResult {
	const [data, setData] = useState<WorkspacesData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Fetch workspaces data
	const fetchWorkspaces = useCallback(async (signal: AbortSignal) => {
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
	}, [isInitialLoad]);

	// Initial fetch on mount
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetchWorkspaces(signal);
		},
		[enabled] // Only re-run if enabled changes
	);

	// Polling effect - separate from initial fetch to avoid re-creating intervals
	useEffect(() => {
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad) return;

		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchWorkspaces(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchWorkspaces]);

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
		refresh,
		clearError,
	};
}
