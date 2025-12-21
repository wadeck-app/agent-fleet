import type { WorkersData } from '@shared';
import { useState, useCallback, useEffect } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';

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
 * - Optional polling
 * - Manual refresh
 * - Loading/error states
 * - AbortController support for cleanup
 *
 * ===========================================================================================
 */

export interface UseWorkersParams {
	enabled?: boolean;
	pollInterval?: number; // milliseconds
}

export interface UseWorkersResult {
	data: WorkersData | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useWorkers({ enabled = true, pollInterval }: UseWorkersParams = {}): UseWorkersResult {
	const [data, setData] = useState<WorkersData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Fetch workers data
	const fetchWorkers = useCallback(async (signal: AbortSignal) => {
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
	}, [isInitialLoad]);

	// Initial fetch on mount
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetchWorkers(signal);
		},
		[enabled] // Only re-run if enabled changes
	);

	// Polling effect - separate from initial fetch to avoid re-creating intervals
	useEffect(() => {
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad) return;

		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetchWorkers(controller.signal);
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, fetchWorkers]);

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
		refresh,
		clearError,
	};
}
