import type { PROJECTS_API_ROUTES } from '@app/shared/api/projects.contract';
import { PROJECTS_API_ROUTES as routes } from '@app/shared/api/projects.contract';

import type { ProjectsService } from '../services/ProjectsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * PROJECTS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for projects.
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
 * Routes:
 * - GET /api/projects/ - List projects with pagination, search, sort
 * - POST /api/projects/ - Create a new project
 * - DELETE /api/projects/ - Bulk delete projects
 * - GET /api/projects/:id - Get project by ID
 * - PATCH /api/projects/:id - Update project
 * - DELETE /api/projects/:id - Delete project
 * - POST /api/projects/:id/workspaces - Add workspaces to project
 * - GET /api/projects/:id/board - Get board data (tasks grouped by status)
 *
 * ===========================================================================================
 */
export default class ProjectsController implements LazyController<typeof PROJECTS_API_ROUTES> {
	static routes = routes;

	constructor(private readonly service: ProjectsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof PROJECTS_API_ROUTES>) {
		/**
		 * GET /api/projects/
		 * List all projects with optional pagination, search, and filters
		 */
		add('GET', '/api/projects/', async ({ query }) => {
			// If pagination params are present, use paginated list
			if (query.page || query.pageSize || query.sortBy) {
				return this.service.getProjectsList(query);
			}
			// Otherwise, return full data with summary
			return this.service.getProjectsData();
		});

		/**
		 * POST /api/projects/
		 * Create a new project
		 */
		add('POST', '/api/projects/', async ({ body }) => {
			return this.service.create(body);
		});

		/**
		 * DELETE /api/projects/
		 * Bulk delete projects
		 */
		add('DELETE', '/api/projects/', async ({ body }) => {
			return this.service.bulkDelete(body.ids);
		});

		/**
		 * GET /api/projects/:id
		 * Get a project by ID
		 */
		add('GET', '/api/projects/:id', async ({ params }) => {
			return this.service.getById(params.id);
		});

		/**
		 * PATCH /api/projects/:id
		 * Update a project (with optimistic locking)
		 */
		add('PATCH', '/api/projects/:id', async ({ params, body }) => {
			return this.service.update(params.id, body);
		});

		/**
		 * DELETE /api/projects/:id
		 * Delete a project
		 */
		add('DELETE', '/api/projects/:id', async ({ params }) => {
			await this.service.delete(params.id);
			return { success: true };
		});

		/**
		 * POST /api/projects/:id/workspaces
		 * Add workspaces to a project
		 */
		add('POST', '/api/projects/:id/workspaces', async ({ params, body }) => {
			return this.service.addWorkspaces(params.id, body);
		});

		/**
		 * GET /api/projects/:id/board
		 * Get board data with tasks grouped by status
		 */
		add('GET', '/api/projects/:id/board', async ({ params }) => {
			return this.service.getProjectBoard(params.id);
		});

		/**
		 * GET /api/projects/:projectId/status-config
		 * Get the status configuration for a project (returns default if not set)
		 */
		add('GET', '/api/projects/:projectId/status-config', async ({ params }) => {
			return this.service.getStatusConfig(params.projectId);
		});

		/**
		 * PUT /api/projects/:projectId/status-config
		 * Save/replace the status configuration for a project
		 */
		add('PUT', '/api/projects/:projectId/status-config', async ({ params, body }) => {
			return this.service.saveStatusConfig(params.projectId, body);
		});
	}
}
