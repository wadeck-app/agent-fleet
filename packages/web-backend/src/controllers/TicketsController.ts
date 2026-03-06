import { TICKETS_API_ROUTES } from '@app/shared/api/tickets.contract';

import type { TicketsService } from '../services/TicketsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * TICKETS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for tickets.
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
export default class TicketsController implements LazyController<typeof TICKETS_API_ROUTES> {
	static routes = TICKETS_API_ROUTES;

	constructor(private readonly service: TicketsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof TICKETS_API_ROUTES>) {
		/**
		 * GET /api/tickets/
		 * Get tickets list with optional filtering
		 * Query params: projectId, status, parentId, label
		 */
		add('GET', '/api/tickets/', async ({ query }) => {
			return this.service.listTickets(query);
		});

		/**
		 * POST /api/tickets/
		 * Create a new ticket
		 */
		add('POST', '/api/tickets/', async ({ body }) => {
			return this.service.createTicket(body);
		});

		/**
		 * GET /api/tickets/labels
		 * Search labels within a project
		 * Query params: projectId, q (optional search query)
		 */
		add('GET', '/api/tickets/labels', async ({ query }) => {
			return this.service.searchLabels(query.projectId, query.q);
		});

		/**
		 * POST /api/tickets/analyze
		 * Analyze ticket description using AI
		 */
		add('POST', '/api/tickets/analyze', async ({ body }) => {
			return this.service.analyzeTicket(body);
		});

		/**
		 * POST /api/tickets/create-from-plan
		 * Create tickets from an AI-generated plan
		 */
		add('POST', '/api/tickets/create-from-plan', async ({ body }) => {
			return this.service.createFromPlan(body);
		});

		/**
		 * GET /api/tickets/:id
		 * Get a single ticket by ID
		 */
		add('GET', '/api/tickets/:id', async ({ params }) => {
			const ticket = await this.service.getTicketById(params.id);
			if (!ticket) {
				throw new Error(`Ticket ${params.id} not found`);
			}
			return ticket;
		});

		/**
		 * PATCH /api/tickets/:id
		 * Update a ticket
		 */
		add('PATCH', '/api/tickets/:id', async ({ params, body }) => {
			return this.service.updateTicket(params.id, body);
		});

		/**
		 * DELETE /api/tickets/:id
		 * Delete a ticket
		 */
		add('DELETE', '/api/tickets/:id', async ({ params }) => {
			return this.service.deleteTicket(params.id);
		});

		/**
		 * PATCH /api/tickets/:id/reorder
		 * Reorder a ticket (update order field)
		 */
		add('PATCH', '/api/tickets/:id/reorder', async ({ params, body }) => {
			return this.service.reorderTicket(params.id, body);
		});

		/**
		 * GET /api/tickets/:ticketId/comments
		 * Get all comments for a ticket
		 */
		add('GET', '/api/tickets/:ticketId/comments', async ({ params }) => {
			return this.service.getComments(params.ticketId);
		});

		/**
		 * POST /api/tickets/:ticketId/comments
		 * Add a comment to a ticket
		 */
		add('POST', '/api/tickets/:ticketId/comments', async ({ params, body }) => {
			return this.service.addComment(params.ticketId, body);
		});

		/**
		 * GET /api/tickets/:ticketId/history
		 * Get the full audit/event history for a ticket
		 */
		add('GET', '/api/tickets/:ticketId/history', async ({ params }) => {
			return this.service.getHistory(params.ticketId);
		});
	}
}
