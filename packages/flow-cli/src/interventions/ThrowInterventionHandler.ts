import type { InterventionHandler, InterventionRequest, InterventionResponse } from 'flow-engine';

export class ThrowInterventionHandler implements InterventionHandler {
	async requestIntervention(request: InterventionRequest): Promise<InterventionResponse | null> {
		throw new Error(
			`Flow contains a user_intervention step ('${request.stepId}'). ` +
				`Use Agent Fleet for interactive flows, or run with a flow that has no user_intervention steps.`
		);
	}
}
