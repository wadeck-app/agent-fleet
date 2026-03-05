import { useCallback, useEffect, useState } from 'react';

import type { Worker } from '@shared/api/workers.contract';

import { workersApi } from '../workers.api';

interface UseWorkerState {
	worker: Worker | null;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Hook for fetching a single worker by ID with real-time update support
 */
export function useWorker(workerId: string): UseWorkerState {
	const [worker, setWorker] = useState<Worker | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Initial load
	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);

				const fetchedWorker = await workersApi.getWorker(workerId);

				if (!abortController.signal.aborted) {
					setWorker(fetchedWorker);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch worker'));
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

	// Silent refetch (for real-time updates) - doesn't show loading spinner
	const refetch = useCallback(async () => {
		try {
			const fetchedWorker = await workersApi.getWorker(workerId);
			setWorker(fetchedWorker);
		} catch (err) {
			console.error('Failed to refetch worker:', err);
			// Silently fail - don't disrupt UX for background updates
		}
	}, [workerId]);

	return {
		worker,
		isLoading,
		isError: error !== null,
		error,
		refetch,
	};
}
