import { FLOW_FEEDBACK_MANAGEMENT_ROUTES } from '@app/shared/api/flow-feedback.contract';

import type { FlowFeedbackService } from '../services/FlowFeedbackService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * FLOW FEEDBACK CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for flow feedback management (update/delete).
 * Routes live under /api/flow-feedback because they are feedback-ID-scoped operations.
 *
 * Handled routes:
 * - PUT    /api/flow-feedback/:feedbackId  → updateFeedback
 * - DELETE /api/flow-feedback/:feedbackId  → deleteFeedback
 *
 * Note: Creation (POST) and retrieval routes are handled in TicketsController and
 * FlowsController respectively; those are ticket-scoped or flow-scoped subresources.
 *
 * This controller is registered separately in routes.ts at /api/flow-feedback.
 *
 * ===========================================================================================
 */
export default class FlowFeedbackController implements LazyController<typeof FLOW_FEEDBACK_MANAGEMENT_ROUTES> {
	static routes = FLOW_FEEDBACK_MANAGEMENT_ROUTES;

	constructor(private readonly service: FlowFeedbackService) {}

	configureRoutes(add: RouteWrapperFunc<typeof FLOW_FEEDBACK_MANAGEMENT_ROUTES>) {
		/**
		 * PUT /api/flow-feedback/:feedbackId
		 * Update an existing feedback entry
		 */
		add('PUT', '/api/flow-feedback/:feedbackId', async ({ params, body }) => {
			return this.service.updateFeedback(params.feedbackId, body);
		});

		/**
		 * DELETE /api/flow-feedback/:feedbackId
		 * Delete a feedback entry
		 */
		add('DELETE', '/api/flow-feedback/:feedbackId', async ({ params }) => {
			await this.service.deleteFeedback(params.feedbackId);
			return {};
		});
	}
}
