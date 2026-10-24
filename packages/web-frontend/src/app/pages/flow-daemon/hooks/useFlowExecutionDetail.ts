import { useCallback } from 'react';

import type { FlowExecutionDetail } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { type FlowDaemonResource, useFlowDaemonResource } from './useFlowDaemonResource';

/** Loads one execution (header, steps and the `flow show` text). */
export function useFlowExecutionDetail(executionId: string): FlowDaemonResource<FlowExecutionDetail> {
	const fetchExecution = useCallback(() => flowDaemonService.getExecution(executionId), [executionId]);
	return useFlowDaemonResource(fetchExecution);
}
