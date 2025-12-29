import { FLOWS_API_ROUTES } from '@app/shared/api/flows.contract';
import { HttpException } from '@app/shared/exceptions/http-exceptions';

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

		/**
		 * GET /api/flows/list
		 * Get list of all available flows
		 */
		add('GET', '/api/flows/list', async () => {
			return this.service.getFlowsList();
		});

		/**
		 * GET /api/flows/:flowId
		 * Get a specific flow definition by ID
		 */
		add('GET', '/api/flows/:flowId', async request => {
			const flowId = (request.params as any).flowId as string;
			const flow = await this.service.getFlowById(flowId);

			if (!flow) {
				throw new HttpException(404, `Flow '${flowId}' not found`, 'FLOW_NOT_FOUND');
			}

			return flow;
		});

		/**
		 * PUT /api/flows/:flowId
		 * Save/update a flow definition
		 */
		add('PUT', '/api/flows/:flowId', async request => {
			const flowId = (request.params as any).flowId as string;
			const flowDefinition = request.body as any;

			await this.service.saveFlow(flowId, flowDefinition);

			return { success: true };
		});
	}
}
