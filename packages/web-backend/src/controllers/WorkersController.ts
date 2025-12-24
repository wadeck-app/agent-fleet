import { WORKERS_API_ROUTES } from '@app/shared/api/workers.contract';

import type { WorkersService } from '../services/WorkersService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * WORKERS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for workers.
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
export default class WorkersController implements LazyController<typeof WORKERS_API_ROUTES> {
	static routes = WORKERS_API_ROUTES;

	constructor(private readonly service: WorkersService) {}

	configureRoutes(add: RouteWrapperFunc<typeof WORKERS_API_ROUTES>) {
		/**
		 * GET /api/workers/
		 * Get all workers with summary stats
		 */
		add('GET', '/api/workers/', async () => {
			return this.service.getWorkersData();
		});
	}
}
