import { useCallback, useEffect } from 'react';

import type { FlowExecutionsResponse } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { useFlowDaemonResource } from './useFlowDaemonResource';
import { type UseFlowExecutionsFiltersResult, useFlowExecutionsFilters } from './useFlowExecutionsFilters';

/** Executions change while flows run: refresh silently in the background. */
export const EXECUTIONS_POLL_INTERVAL_MS = 10_000;

export interface UseFlowExecutionsResult extends UseFlowExecutionsFiltersResult {
	executions: FlowExecutionsResponse | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	/** Flow ids for the flow filter; empty while loading or when the lookup failed. */
	flowOptions: string[];
	flowOptionsError: string | null;
}

export function useFlowExecutions(): UseFlowExecutionsResult {
	const filtersState = useFlowExecutionsFilters();
	const { page, limit, status, flow } = filtersState.filters;
	const { setPage } = filtersState;

	const fetchExecutions = useCallback(
		() => flowDaemonService.listExecutions({ page, limit, status, flow }),
		[page, limit, status, flow]
	);
	const executions = useFlowDaemonResource(fetchExecutions, EXECUTIONS_POLL_INTERVAL_MS);

	const fetchFlowIds = useCallback(() => flowDaemonService.listFlowIds(), []);
	const flowIds = useFlowDaemonResource(fetchFlowIds);

	// Executions can disappear (e.g. history cleaned) while the user sits on a late page: go back to the last page
	const total = executions.data?.total;
	useEffect(() => {
		if (total !== undefined && total > 0 && page * limit >= total) {
			setPage(Math.floor((total - 1) / limit));
		}
	}, [total, page, limit, setPage]);

	const refreshExecutions = executions.refresh;
	const refreshFlowIds = flowIds.refresh;
	const refresh = useCallback(() => {
		refreshExecutions();
		refreshFlowIds();
	}, [refreshExecutions, refreshFlowIds]);

	return {
		...filtersState,
		executions: executions.data,
		loading: executions.loading,
		error: executions.error,
		refresh,
		flowOptions: flowIds.data ?? [],
		flowOptionsError: flowIds.error,
	};
}
