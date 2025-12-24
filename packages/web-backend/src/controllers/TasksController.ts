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
		 * Query params: status, workerId, priority
		 */
		add('GET', '/api/tasks/', async ({ query }) => {
			return this.service.getTasksData(query);
		});
	}
}
