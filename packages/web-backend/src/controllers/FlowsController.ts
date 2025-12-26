import { FLOWS_API_ROUTES } from '@app/shared/api/flows.contract';

import type { FlowsService } from '../services/FlowsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * FLOWS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for flows.
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
export default class FlowsController implements LazyController<typeof FLOWS_API_ROUTES> {
	static routes = FLOWS_API_ROUTES;

	constructor(private readonly service: FlowsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof FLOWS_API_ROUTES>) {
		/**
		 * GET /api/flows/
		 * Get all flows organized by project
		 */
		add('GET', '/api/flows/', async () => {
			return this.service.getFlows();
		});
	}
}
