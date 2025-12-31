import { TASKS_API_ROUTES } from '@app/shared/api/tasks.contract';

import type { TasksService } from '../services/TasksService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * TASKS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for tasks.
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
export default class TasksController implements LazyController<typeof TASKS_API_ROUTES> {
	static routes = TASKS_API_ROUTES;

	constructor(private readonly service: TasksService) {}

	configureRoutes(add: RouteWrapperFunc<typeof TASKS_API_ROUTES>) {
		/**
		 * GET /api/tasks/
		 * Get tasks data with optional filtering
		 * Query params: status, workerId, priority, page, pageSize, sortBy, sortOrder, search
		 *
		 * Routes to either:
		 * - getTasksList() if pagination params present (new Data2 format)
		 * - getTasksData() if no pagination params (legacy format for backwards compatibility)
		 */
		add('GET', '/api/tasks/', async ({ query }) => {
			// Check if pagination requested (new format)
			if (query.page !== undefined || query.pageSize !== undefined) {
				return this.service.getTasksList(query);
			}

			// Legacy format (backwards compatibility)
			return this.service.getTasksData(query);
		});

		/**
		 * POST /api/tasks/
		 * Create a new task
		 */
		add('POST', '/api/tasks/', async ({ body }) => {
			return this.service.createTask(body);
		});

		/**
		 * GET /api/tasks/:id
		 * Get a single task by ID with full trace
		 */
		add('GET', '/api/tasks/:id', async ({ params }) => {
			const task = await this.service.getTaskById(params.id);
			if (!task) {
				throw new Error(`Task ${params.id} not found`);
			}
			return task;
		});

		/**
		 * GET /api/tasks/:id/logs
		 * Get paginated logs for a task
		 * Query params: cursor, limit, level, search
		 */
		add('GET', '/api/tasks/:id/logs', async ({ params, query }) => {
			return this.service.getTaskLogs(params.id, query);
		});

		/**
		 * DELETE /api/tasks/:id
		 * Delete a task
		 */
		add('DELETE', '/api/tasks/:id', async ({ params }) => {
			await this.service.deleteTask(params.id);
			return { success: true };
		});
	}
}
