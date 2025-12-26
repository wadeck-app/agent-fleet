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
		 * Query params (optional): page, pageSize, sortBy, sortOrder, search
		 *
		 * Routes to either:
		 * - getWorkersList() if pagination params present (new Data2 format)
		 * - getWorkersData() if no pagination params (legacy format for backwards compatibility)
		 */
		add('GET', '/api/workers/', async ({ query }) => {
			// Check if pagination requested (new format)
			if (query && (query.page !== undefined || query.pageSize !== undefined)) {
				return this.service.getWorkersList(query);
			}

			// Legacy format (backwards compatibility)
			return this.service.getWorkersData();
		});

		/**
		 * GET /api/workers/:workerId/flows
		 * Get flows for a specific worker
		 */
		add('GET', '/api/workers/:workerId/flows', async ({ params }) => {
			return this.service.getWorkerFlows(params.workerId);
		});
	}
}
