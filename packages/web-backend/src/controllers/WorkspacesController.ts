import { WORKSPACES_API_ROUTES } from '@app/shared/api/workspaces.contract';

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
	static routes = WORKSPACES_API_ROUTES;

	constructor(private readonly service: WorkspacesService) {}

	configureRoutes(add: RouteWrapperFunc<typeof WORKSPACES_API_ROUTES>) {
		/**
		 * GET /api/workspaces/
		 * Get all workspaces with summary stats
		 * Query params (optional): page, pageSize, sortBy, sortOrder, search, status, mode
		 *
		 * Routes to either:
		 * - getWorkspacesList() if pagination params present (new Data2 format)
		 * - getWorkspacesData() if no pagination params (legacy format for backwards compatibility)
		 */
		add('GET', '/api/workspaces/', async ({ query }) => {
			// Check if pagination requested (new format)
			if (query && (query.page !== undefined || query.pageSize !== undefined)) {
				return this.service.getWorkspacesList(query);
			}

			// Legacy format (backwards compatibility)
			return this.service.getWorkspacesData();
		});
	}
}
