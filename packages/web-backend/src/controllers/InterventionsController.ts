import type { INTERVENTIONS_API_ROUTES } from '@app/shared/api/interventions.contract';
import { INTERVENTIONS_API_ROUTES as routes } from '@app/shared/api/interventions.contract';

import type { InterventionsService } from '../services/InterventionsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * INTERVENTIONS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for user interventions.
 * Responsibilities:
 * - HTTP request/response handling
 * - Route definition
 * - Input validation (via Zod schemas in contracts)
 * - Delegate to service layer
 *
 * Does NOT contain:
 * - Business logic (in service)
 * - Data access (in repository)
 *
 * ===========================================================================================
 */
export default class InterventionsController implements LazyController<typeof INTERVENTIONS_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: InterventionsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof INTERVENTIONS_API_ROUTES>) {
		/**
		 * GET /api/interventions
		 * Get list of interventions with optional filtering
		 */
		add('GET', '/api/interventions/', async request => {
			return this.service.getInterventions(request.query);
		});

		/**
		 * GET /api/interventions/:interventionId
		 * Get a single intervention by ID
		 */
		add('GET', '/api/interventions/:interventionId', async request => {
			const intervention = await this.service.getIntervention(request.params.interventionId);
			if (!intervention) {
				request.reply.code(404);
				throw new Error('Intervention not found');
			}
			return intervention;
		});

		/**
		 * POST /api/interventions/:interventionId/respond
		 * Respond to an intervention
		 */
		add('POST', '/api/interventions/:interventionId/respond', async request => {
			return this.service.respondToIntervention(request.params.interventionId, request.body);
		});

		/**
		 * POST /api/interventions/:interventionId/cancel
		 * Cancel an intervention
		 */
		add('POST', '/api/interventions/:interventionId/cancel', async request => {
			return this.service.cancelIntervention(request.params.interventionId);
		});
	}
}
