import { useCallback } from 'react';

import type { FlowWorkersResponse } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { type FlowDaemonResource, useFlowDaemonResource } from './useFlowDaemonResource';

/** Workers connect and disconnect continuously: refresh silently in the background. */
export const WORKERS_POLL_INTERVAL_MS = 10_000;

export function useFlowWorkers(): FlowDaemonResource<FlowWorkersResponse> {
	const fetchWorkers = useCallback(() => flowDaemonService.getWorkers(), []);
	return useFlowDaemonResource(fetchWorkers, WORKERS_POLL_INTERVAL_MS);
}
