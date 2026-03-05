import { useCallback, useEffect, useState } from 'react';

import type { WorkerFlows } from '@shared/api/flows.contract';

import { workersApi } from '../workers.api';

interface UseWorkerFlowsState {
	flows: WorkerFlows;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Hook for fetching worker flows with real-time update support
 */
export function useWorkerFlows(workerId: string): UseWorkerFlowsState {
	const [flows, setFlows] = useState<WorkerFlows>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Initial load
	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);

				const fetchedFlows = await workersApi.getWorkerFlows(workerId);

				if (!abortController.signal.aborted) {
					setFlows(fetchedFlows);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch worker flows'));
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
	}, [workerId]);

	// Silent refetch (for real-time updates)
	const refetch = useCallback(async () => {
		try {
			const fetchedFlows = await workersApi.getWorkerFlows(workerId);
			setFlows(fetchedFlows);
		} catch (err) {
			console.error('Failed to refetch worker flows:', err);
			// Silently fail - don't disrupt UX for background updates
		}
	}, [workerId]);

	return {
		flows,
		isLoading,
		isError: error !== null,
		error,
		refetch,
	};
}
