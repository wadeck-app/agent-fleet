import { createTypedFetch } from '@framework/api/api-base';
import { FLOWS_API_ROUTES } from '@shared/api/flows.contract';
import type { FlowsByProject } from '@shared/api/flows.contract';

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
} as const;
