import { useEffect, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowListItem } from '@shared/api/flows.contract';

import { flowsApi } from '../flowsApi';

/**
 * Hook to load and manage the list of available flows
 */
export function useFlowsList() {
	const [flows, setFlows] = useState<FlowListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadFlows();
	}, []);

	const loadFlows = async () => {
		setLoading(true);
		setError(null);
		try {
			const flowsList = await flowsApi.getFlowsList();
			setFlows(flowsList);
		} catch (err) {
			console.error('[useFlowsList] Error loading flows:', err);
			setError(getErrorMessage(err));
			setFlows([]);
		} finally {
			setLoading(false);
		}
	};

	return { flows, loading, error, reload: loadFlows };
}
