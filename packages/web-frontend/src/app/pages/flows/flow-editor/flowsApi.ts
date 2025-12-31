import { createTypedFetch } from '@framework/api/api-base';
import { FLOWS_API_ROUTES, type FlowDefinition } from '@shared/api/flows.contract';

const typedFetch = createTypedFetch(FLOWS_API_ROUTES);

export const flowsApi = {
	/**
	 * Get list of all available flows
	 */
	getFlowsList: () => typedFetch('GET', '/api/flows/list', {}),

	/**
	 * Get a specific flow definition by ID
	 */
	getFlowById: (flowId: string) =>
		typedFetch('GET', '/api/flows/:flowId', {
			params: { flowId },
		}),

	/**
	 * Save a flow definition
	 */
	saveFlow: (flowId: string, flowDefinition: FlowDefinition) =>
		typedFetch('PUT', '/api/flows/:flowId', {
			params: { flowId },
			body: flowDefinition,
		}),
} as const;
