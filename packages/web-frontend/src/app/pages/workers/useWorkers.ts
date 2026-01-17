import { useEffect, useState } from 'react';

import type { Worker } from '@shared/api/workers.contract';

import { workersApi } from './workers.api';

interface UseWorkersResult {
	data: { workers: Worker[] } | null;
	loading: boolean;
	error: Error | null;
}

/**
 * Simple hook to fetch all workers
 * Used by CreateTaskDialog to get the list of available workers
 */
export function useWorkers(): UseWorkersResult {
	const [data, setData] = useState<{ workers: Worker[] } | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		const fetchWorkers = async () => {
			try {
				setLoading(true);
				setError(null);
				// Fetch all workers without pagination for the dialog
				const response = await workersApi.getWorkersList({
					page: 1,
					pageSize: 100, // Get enough workers for the dropdown
				});
				setData({ workers: response.items });
			} catch (err) {
				setError(err instanceof Error ? err : new Error('Failed to fetch workers'));
			} finally {
				setLoading(false);
			}
		};

		fetchWorkers();
	}, []);

	return { data, loading, error };
}
