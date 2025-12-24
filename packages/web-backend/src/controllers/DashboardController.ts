import type { DASHBOARD_API_ROUTES } from '@app/shared/api/dashboard.contract';
import { DASHBOARD_API_ROUTES as routes } from '@app/shared/api/dashboard.contract';

import type { DashboardService } from '../services/DashboardService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * DASHBOARD CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for dashboard.
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
export default class DashboardController implements LazyController<typeof DASHBOARD_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: DashboardService) {}

	configureRoutes(add: RouteWrapperFunc<typeof DASHBOARD_API_ROUTES>) {
		/**
		 * GET /api/dashboard
		 * Get dashboard data with orchestrator stats
		 */
		add('GET', '/api/dashboard/', async () => {
			return this.service.getDashboardData();
		});
	}
}
