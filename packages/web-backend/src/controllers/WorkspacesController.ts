import type { WORKSPACES_API_ROUTES } from '@app/shared';
import { WORKSPACES_API_ROUTES as routes } from '@app/shared';

import type { WorkspacesService } from '../services/WorkspacesService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * WORKSPACES CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for workspaces.
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
export default class WorkspacesController implements LazyController<typeof WORKSPACES_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: WorkspacesService) {}

	configureRoutes(add: RouteWrapperFunc<typeof WORKSPACES_API_ROUTES>) {
		/**
		 * GET /api/workspaces/
		 * Get all workspaces with summary stats
		 */
		add('GET', '/api/workspaces/', async () => {
			return this.service.getWorkspacesData();
		});
	}
}
