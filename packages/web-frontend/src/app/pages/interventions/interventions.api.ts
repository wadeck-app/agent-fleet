import { createTypedFetch } from '@framework/api/api-base';
import type {
	BulkCancelRequest,
	BulkCancelResponse,
	Intervention,
	InterventionResponseSubmit,
	InterventionsListResponse,
	InterventionsQuery,
	SuccessResponse,
} from '@shared/api/interventions.contract';
import { INTERVENTIONS_API_ROUTES } from '@shared/api/interventions.contract';

const typedFetch = createTypedFetch(INTERVENTIONS_API_ROUTES);

export const interventionsApi = {
	/**
	 * Get list of interventions with optional filtering
	 */
	getInterventions: (query?: InterventionsQuery): Promise<InterventionsListResponse> => {
		return typedFetch('GET', '/api/interventions/', { query: query || {} });
	},

	/**
	 * Get a single intervention by ID
	 */
	getIntervention: (id: string): Promise<Intervention> => {
		return typedFetch('GET', '/api/interventions/:id', {
			params: { id },
		});
	},

	/**
	 * Respond to an intervention
	 */
	respondToIntervention: (id: string, response: InterventionResponseSubmit): Promise<SuccessResponse> => {
		return typedFetch('POST', '/api/interventions/:id/respond', {
			params: { id },
			body: response,
		});
	},

	/**
	 * Cancel an intervention
	 */
	cancelIntervention: (id: string): Promise<SuccessResponse> => {
		return typedFetch('POST', '/api/interventions/:id/cancel', {
			params: { id },
		});
	},

	/**
	 * Bulk cancel multiple interventions
	 */
	bulkCancelInterventions: (ids: string[]): Promise<BulkCancelResponse> => {
		return typedFetch('POST', '/api/interventions/bulk-cancel/', {
			body: { ids },
		});
	},
} as const;
