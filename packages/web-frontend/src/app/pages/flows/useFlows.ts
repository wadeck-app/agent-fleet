import { useEffect, useState } from 'react';

import type { FlowsByProject } from '@shared/api/flows.contract';

import { flowsService } from './FlowsService';

/**
 * ===========================================================================================
 * USE FLOWS HOOK
 * ===========================================================================================
 *
 * Custom hook for managing flows data fetching and state.
 *
 * Features:
 * - Auto-fetch on mount
 * - Loading/error states
 *
 * ===========================================================================================
 */

export interface UseFlowsResult {
	flows: FlowsByProject;
	loading: boolean;
	error: string | null;
}

export function useFlows(): UseFlowsResult {
	const [flows, setFlows] = useState<FlowsByProject>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchFlows = async () => {
			try {
				setLoading(true);
				const data = await flowsService.getFlows();
				setFlows(data);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch flows');
			} finally {
				setLoading(false);
			}
		};

		fetchFlows();
	}, []);

	return { flows, loading, error };
}
