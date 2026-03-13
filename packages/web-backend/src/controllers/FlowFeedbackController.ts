import { TICKETS_API_ROUTES } from '@app/shared/api/tickets.contract';

import type { FlowFeedbackService } from '../services/FlowFeedbackService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * FLOW FEEDBACK CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for flow feedback and retrospectives.
 * Routes live under /api/tickets/:ticketId because they are ticket-scoped subresources.
 *
 * Handled routes:
 * - POST /api/tickets/:ticketId/feedback       → submitFeedback
 * - POST /api/tickets/:ticketId/retrospective  → submitRetrospective
 * - GET  /api/tickets/:ticketId/retrospective  → getRetrospective
 *
 * Note: GET /api/flows/:flowId/feedback is handled in FlowsController.
 *
 * This controller is NOT registered separately in routes.ts; its service is injected
 * into TicketsController which is already registered at /api/tickets.
 *
 * ===========================================================================================
 */
export default class FlowFeedbackController implements LazyController<typeof TICKETS_API_ROUTES> {
	static routes = TICKETS_API_ROUTES;

	constructor(private readonly service: FlowFeedbackService) {}

	configureRoutes(add: RouteWrapperFunc<typeof TICKETS_API_ROUTES>) {
		/**
		 * POST /api/tickets/:ticketId/feedback
		 * Submit human feedback for a completed flow run
		 */
		add('POST', '/api/tickets/:ticketId/feedback', async ({ params, body }) => {
			return this.service.submitFeedback(params.ticketId, body);
		});

		/**
		 * POST /api/tickets/:ticketId/retrospective
		 * Submit an AI-generated retrospective
		 */
		add('POST', '/api/tickets/:ticketId/retrospective', async ({ params, body }) => {
			return this.service.submitRetrospective(params.ticketId, body);
		});

		/**
		 * GET /api/tickets/:ticketId/retrospective
		 * Get the retrospective for a ticket
		 */
		add('GET', '/api/tickets/:ticketId/retrospective', async ({ params }) => {
			return this.service.getRetrospective(params.ticketId);
		});
	}
}
