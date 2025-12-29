import { createTypedFetch } from '@framework/api/api-base';
import { FLOWS_API_ROUTES } from '@shared/api/flows.contract';
import type { FlowDefinition, FlowListItem, FlowsByProject } from '@shared/api/flows.contract';

/**
 * ===========================================================================================
 * FLOWS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for flows endpoints.
 * Generated from the FLOWS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(FLOWS_API_ROUTES);

export const flowsApi = {
	getFlows: (): Promise<FlowsByProject> => {
		return typedFetch('GET', '/api/flows/', {});
	},

	getFlowsList: (): Promise<FlowListItem[]> => {
		return typedFetch('GET', '/api/flows/list', {});
	},

	getFlowById: (flowId: string): Promise<FlowDefinition> => {
		return typedFetch('GET', '/api/flows/:flowId', {
			params: { flowId },
		});
	},

	saveFlow: (flowId: string, flowDefinition: FlowDefinition): Promise<{ success: boolean }> => {
		return typedFetch('PUT', '/api/flows/:flowId', {
			params: { flowId },
			body: flowDefinition,
		});
	},
} as const;
