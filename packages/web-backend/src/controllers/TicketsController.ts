import { FLOW_PROPOSALS_API_ROUTES } from '@app/shared/api/flow-proposals.contract';
import { TICKETS_API_ROUTES } from '@app/shared/api/tickets.contract';

import type { FlowFeedbackService } from '../services/FlowFeedbackService';
import type { FlowProposalsService } from '../services/FlowProposalsService';
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
	static routes = { ...TICKETS_API_ROUTES, ...FLOW_PROPOSALS_API_ROUTES };

	constructor(
		private readonly service: TicketsService,
		private readonly flowFeedbackService: FlowFeedbackService,
		private readonly flowProposalsService: FlowProposalsService
	) {}

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
		 * POST /api/tickets/create-with-ai-title
		 * Create ticket immediately with placeholder title, generate real title async
		 */
		add('POST', '/api/tickets/create-with-ai-title', async ({ body }) => {
			return this.service.createWithAiTitle(body);
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

		/**
		 * POST /api/tickets/:ticketId/feedback
		 * Submit human feedback for a completed flow run
		 */
		add('POST', '/api/tickets/:ticketId/feedback', async ({ params, body }) => {
			return this.flowFeedbackService.submitFeedback(params.ticketId, body);
		});

		/**
		 * POST /api/tickets/:ticketId/retrospective
		 * Submit an AI-generated retrospective
		 */
		add('POST', '/api/tickets/:ticketId/retrospective', async ({ params, body }) => {
			return this.flowFeedbackService.submitRetrospective(params.ticketId, body);
		});

		/**
		 * GET /api/tickets/:ticketId/retrospective
		 * Get the retrospective for a ticket
		 */
		add('GET', '/api/tickets/:ticketId/retrospective', async ({ params }) => {
			return this.flowFeedbackService.getRetrospective(params.ticketId);
		});

		// ---------------------------------------------------------------------------
		// Flow proposals routes
		// These routes come from FLOW_PROPOSALS_API_ROUTES (merged via ROUTES_BY_BASE_URL).
		// Cast `add` to the proposals-typed version for full type safety here.
		// @formatter:off
		const addProposal = add as unknown as RouteWrapperFunc<typeof FLOW_PROPOSALS_API_ROUTES>;
		// @formatter:on

		/**
		 * POST /api/tickets/:ticketId/request-flow-design
		 * Trigger AI flow design for a ticket
		 */
		addProposal('POST', '/api/tickets/:ticketId/request-flow-design', async ({ params, body }) => {
			return this.flowProposalsService.requestFlowDesign(params.ticketId, body.context);
		});

		/**
		 * GET /api/tickets/:ticketId/flow-proposals
		 * List all flow proposals for a ticket
		 */
		addProposal('GET', '/api/tickets/:ticketId/flow-proposals', async ({ params }) => {
			const items = await this.flowProposalsService.getProposals(params.ticketId);
			return { items };
		});

		/**
		 * GET /api/tickets/:ticketId/flow-proposals/:proposalId
		 * Get a single flow proposal
		 */
		addProposal('GET', '/api/tickets/:ticketId/flow-proposals/:proposalId', async ({ params }) => {
			return this.flowProposalsService.getProposal(params.ticketId, params.proposalId);
		});

		/**
		 * POST /api/tickets/:ticketId/flow-proposals/:proposalId/approve
		 * Approve a flow proposal
		 */
		addProposal('POST', '/api/tickets/:ticketId/flow-proposals/:proposalId/approve', async ({ params }) => {
			return this.flowProposalsService.approveProposal(params.ticketId, params.proposalId);
		});

		/**
		 * POST /api/tickets/:ticketId/flow-proposals/:proposalId/reject
		 * Reject a flow proposal and trigger redesign
		 */
		addProposal('POST', '/api/tickets/:ticketId/flow-proposals/:proposalId/reject', async ({ params, body }) => {
			return this.flowProposalsService.rejectProposal(params.ticketId, params.proposalId, body.reason);
		});

		/**
		 * POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads
		 * Add a review thread with initial comment
		 */
		addProposal(
			'POST',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads',
			async ({ params, body }) => {
				return this.flowProposalsService.addReviewThread(params.ticketId, params.proposalId, body);
			}
		);

		/**
		 * POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments
		 * Add a comment to an existing thread
		 */
		addProposal(
			'POST',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments',
			async ({ params, body }) => {
				return this.flowProposalsService.addCommentToThread(
					params.ticketId,
					params.proposalId,
					params.threadId,
					body
				);
			}
		);

		/**
		 * PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId
		 * Update a review thread (resolve and/or change selector)
		 */
		addProposal(
			'PATCH',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId',
			async ({ params, body }) => {
				return this.flowProposalsService.updateThread(
					params.ticketId,
					params.proposalId,
					params.threadId,
					body
				);
			}
		);

		/**
		 * DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId
		 * Delete a review thread and all its comments
		 */
		addProposal(
			'DELETE',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId',
			async ({ params }) => {
				return this.flowProposalsService.deleteThread(params.ticketId, params.proposalId, params.threadId);
			}
		);

		/**
		 * DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId
		 * Delete a comment (deletes thread if it was the last comment)
		 */
		addProposal(
			'DELETE',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId',
			async ({ params }) => {
				return this.flowProposalsService.deleteComment(
					params.ticketId,
					params.proposalId,
					params.threadId,
					params.commentId
				);
			}
		);

		/**
		 * PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId
		 * Edit a comment's content
		 */
		addProposal(
			'PATCH',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId',
			async ({ params, body }) => {
				return this.flowProposalsService.updateComment(
					params.ticketId,
					params.proposalId,
					params.threadId,
					params.commentId,
					body
				);
			}
		);
	}
}
