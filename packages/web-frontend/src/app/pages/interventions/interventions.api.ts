import { createTypedFetch } from '@framework/api/api-base';
import type {
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
	getIntervention: (interventionId: string): Promise<Intervention> => {
		return typedFetch('GET', '/api/interventions/:interventionId', {
			params: { interventionId },
		});
	},

	/**
	 * Respond to an intervention
	 */
	respondToIntervention: (interventionId: string, response: InterventionResponseSubmit): Promise<SuccessResponse> => {
		return typedFetch('POST', '/api/interventions/:interventionId/respond', {
			params: { interventionId },
			body: response,
		});
	},

	/**
	 * Cancel an intervention
	 */
	cancelIntervention: (interventionId: string): Promise<SuccessResponse> => {
		return typedFetch('POST', '/api/interventions/:interventionId/cancel', {
			params: { interventionId },
		});
	},
} as const;
