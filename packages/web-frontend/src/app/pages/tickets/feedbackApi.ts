import { createTypedFetch } from '@framework/api/api-base';
import type { CreateFlowFeedback, FlowFeedback, FlowRetrospective } from '@shared/api/flow-feedback.contract';
import { FLOW_FEEDBACK_API_ROUTES } from '@shared/api/flow-feedback.contract';

/**
 * ===========================================================================================
 * FLOW FEEDBACK API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for flow feedback and retrospective endpoints.
 * Generated from the FLOW_FEEDBACK_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(FLOW_FEEDBACK_API_ROUTES);

export const feedbackApi = {
	/**
	 * Submit feedback for a ticket's flow execution
	 */
	submitFeedback: (ticketId: string, body: CreateFlowFeedback): Promise<FlowFeedback> => {
		return typedFetch('POST', '/api/tickets/:ticketId/feedback', {
			params: { ticketId },
			body,
		});
	},

	/**
	 * Get all feedback items for a flow proposal
	 */
	getFeedbackByFlow: (flowId: string): Promise<{ items: FlowFeedback[] }> => {
		return typedFetch('GET', '/api/flows/:flowId/feedback', {
			params: { flowId },
		});
	},

	/**
	 * Get the retrospective for a ticket
	 */
	getRetrospective: (ticketId: string): Promise<FlowRetrospective> => {
		return typedFetch('GET', '/api/tickets/:ticketId/retrospective', {
			params: { ticketId },
		});
	},
} as const;
