import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CreateFlowFeedback,
	CreateFlowRetrospective,
	FlowFeedback,
	FlowRetrospective,
} from '@app/shared/api/flow-feedback.contract';
import type {
	AddReviewComment,
	CreateReviewThread,
	FlowProposal,
	FlowReviewComment,
	FlowReviewThread,
} from '@app/shared/api/flow-proposals.contract';
import type {
	AnalyzeTicket,
	CreateFromPlan,
	CreateFromPlanResponse,
	CreateTicket,
	CreateTicketComment,
	CreateWithAiTitle,
	LabelsResponse,
	ReorderTicket,
	Ticket,
	TicketAnalysisPlan,
	TicketComment,
	TicketCommentsResponse,
	TicketHistoryResponse,
	TicketsListResponse,
	UpdateTicket,
} from '@app/shared/api/tickets.contract';
import { NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { FlowFeedbackService } from '../services/FlowFeedbackService';
import type { FlowProposalsService } from '../services/FlowProposalsService';
import type { TicketsService } from '../services/TicketsService';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import TicketsController from './TicketsController';

/**
 * ===========================================================================================
 * TICKETS CONTROLLER TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock all three services (TicketsService, FlowFeedbackService, FlowProposalsService)
 * - Test all CRUD operations for tickets
 * - Test all flow proposal routes (request, list, get, approve, reject, threads, comments, resolve)
 * - Test error scenarios (NotFoundException thrown by services)
 * - Test route registration (all routes are captured at configureRoutes time)
 *
 * ===========================================================================================
 */

// ---------------------------------------------------------------------------
// Shared test data factories
// ---------------------------------------------------------------------------

const makeSampleTicket = (): Ticket => ({
	id: 'ticket-1',
	projectId: 'project-1',
	title: 'Fix the login bug',
	description: 'Users cannot log in with SSO',
	status: 'backlog',
	labels: ['bug', 'auth'],
	fields: {},
	taskIds: [],
	order: 1000,
	version: 1,
	createdAt: '2024-01-01T00:00:00.000Z',
	updatedAt: '2024-01-01T00:00:00.000Z',
});

const makeSampleProposal = (): FlowProposal => ({
	id: 'proposal-1',
	ticketId: 'ticket-1',
	version: 1,
	status: 'pending_review',
	proposedFlow: { name: 'fix-login', steps: [] },
	reasoning: 'This flow addresses the SSO authentication issue.',
	reviewThreads: [],
	proposedAt: '2024-01-01T00:00:00.000Z',
});

const makeSampleThread = (): FlowReviewThread => ({
	id: 'thread-1',
	proposalId: 'proposal-1',
	selector: { startLine: 1, endLine: 3 },
	status: 'open',
	comments: [],
	createdAt: '2024-01-01T00:00:00.000Z',
});

const makeSampleComment = (): FlowReviewComment => ({
	id: 'comment-1',
	threadId: 'thread-1',
	content: 'I have a concern about step 2.',
	author: 'user-1',
	createdAt: '2024-01-01T00:00:00.000Z',
});

const makeSampleFeedback = (): FlowFeedback => ({
	id: 'feedback-1',
	ticketId: 'ticket-1',
	flowId: 'flow-1',
	taskId: 'task-1',
	rating: 4,
	wentWell: ['Fast execution'],
	wentWrong: [],
	submittedAt: '2024-01-01T00:00:00.000Z',
	author: 'user-1',
});

const makeSampleRetrospective = (): FlowRetrospective => ({
	id: 'retro-1',
	ticketId: 'ticket-1',
	flowId: 'flow-1',
	taskId: 'task-1',
	wentWell: ['Clean implementation'],
	wentWrong: ['Missing edge case'],
	suggestions: ['Add more tests'],
	executionSummary: 'Flow executed successfully with minor issues.',
	generatedAt: '2024-01-01T00:00:00.000Z',
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TicketsController', () => {
	let controller: TicketsController;
	let mockTicketsService: TicketsService;
	let mockFlowFeedbackService: FlowFeedbackService;
	let mockFlowProposalsService: FlowProposalsService;
	let routes: Map<string, (...args: any[]) => Promise<any>>;

	beforeEach(() => {
		mockTicketsService = {
			listTickets: vi.fn(),
			createTicket: vi.fn(),
			getTicketById: vi.fn(),
			updateTicket: vi.fn(),
			deleteTicket: vi.fn(),
			reorderTicket: vi.fn(),
			searchLabels: vi.fn(),
			analyzeTicket: vi.fn(),
			createWithAiTitle: vi.fn(),
			createFromPlan: vi.fn(),
			getComments: vi.fn(),
			addComment: vi.fn(),
			getHistory: vi.fn(),
		} as unknown as TicketsService;

		mockFlowFeedbackService = {
			submitFeedback: vi.fn(),
			submitRetrospective: vi.fn(),
			getRetrospective: vi.fn(),
		} as unknown as FlowFeedbackService;

		mockFlowProposalsService = {
			requestFlowDesign: vi.fn(),
			getProposals: vi.fn(),
			getProposal: vi.fn(),
			approveProposal: vi.fn(),
			rejectProposal: vi.fn(),
			addReviewThread: vi.fn(),
			addCommentToThread: vi.fn(),
			resolveThread: vi.fn(),
			updateThread: vi.fn(),
			deleteThread: vi.fn(),
			deleteComment: vi.fn(),
			updateComment: vi.fn(),
		} as unknown as FlowProposalsService;

		controller = new TicketsController(mockTicketsService, mockFlowFeedbackService, mockFlowProposalsService);

		routes = new Map();
		// Use `any` cast because routes span two route definition objects (TICKETS + FLOW_PROPOSALS)
		const mockAdd: RouteWrapperFunc<any> = (method, path, handler) => {
			routes.set(`${method} ${path}`, handler);
		};

		controller.configureRoutes(mockAdd);
	});

	// ---------------------------------------------------------------------------
	// Route registration
	// ---------------------------------------------------------------------------

	describe('Route registration', () => {
		it('should register all ticket CRUD routes', () => {
			expect(routes.has('GET /api/tickets/')).toBe(true);
			expect(routes.has('POST /api/tickets/')).toBe(true);
			expect(routes.has('GET /api/tickets/labels')).toBe(true);
			expect(routes.has('POST /api/tickets/analyze')).toBe(true);
			expect(routes.has('POST /api/tickets/create-with-ai-title')).toBe(true);
			expect(routes.has('POST /api/tickets/create-from-plan')).toBe(true);
			expect(routes.has('GET /api/tickets/:id')).toBe(true);
			expect(routes.has('PATCH /api/tickets/:id')).toBe(true);
			expect(routes.has('DELETE /api/tickets/:id')).toBe(true);
			expect(routes.has('PATCH /api/tickets/:id/reorder')).toBe(true);
		});

		it('should register all flow proposals routes', () => {
			expect(routes.has('POST /api/tickets/:ticketId/request-flow-design')).toBe(true);
			expect(routes.has('GET /api/tickets/:ticketId/flow-proposals')).toBe(true);
			expect(routes.has('GET /api/tickets/:ticketId/flow-proposals/:proposalId')).toBe(true);
			expect(routes.has('POST /api/tickets/:ticketId/flow-proposals/:proposalId/approve')).toBe(true);
			expect(routes.has('POST /api/tickets/:ticketId/flow-proposals/:proposalId/reject')).toBe(true);
			expect(routes.has('POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads')).toBe(true);
			expect(
				routes.has('POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments')
			).toBe(true);
			expect(routes.has('PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId')).toBe(
				true
			);
			expect(
				routes.has('DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId')
			).toBe(true);
			expect(
				routes.has(
					'DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
				)
			).toBe(true);
			expect(
				routes.has(
					'PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
				)
			).toBe(true);
		});

		it('should expose static routes property merging both contracts', () => {
			expect(TicketsController.routes).toBeDefined();
			expect(TicketsController.routes['/api/tickets/']).toBeDefined();
			expect(TicketsController.routes['/api/tickets/:ticketId/flow-proposals']).toBeDefined();
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/ — list tickets', () => {
		it('should call service.listTickets with query and return the response', async () => {
			const response: TicketsListResponse = {
				items: [makeSampleTicket()],
			};
			vi.mocked(mockTicketsService.listTickets).mockResolvedValue(response);

			const handler = routes.get('GET /api/tickets/');
			const result = await handler!({ query: { projectId: 'project-1' } });

			expect(mockTicketsService.listTickets).toHaveBeenCalledWith({ projectId: 'project-1' });
			expect(result).toEqual(response);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/ — create ticket', () => {
		it('should call service.createTicket with body and return the created ticket', async () => {
			const body: CreateTicket = {
				projectId: 'project-1',
				title: 'New feature',
				description: 'Implement X',
				status: 'backlog',
				labels: [],
				fields: {},
			};
			const created = makeSampleTicket();
			vi.mocked(mockTicketsService.createTicket).mockResolvedValue(created);

			const handler = routes.get('POST /api/tickets/');
			const result = await handler!({ body });

			expect(mockTicketsService.createTicket).toHaveBeenCalledWith(body);
			expect(result).toEqual(created);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/labels
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/labels — search labels', () => {
		it('should pass projectId and q query params to service and return response', async () => {
			const response: LabelsResponse = { labels: ['bug', 'auth', 'backend'] };
			vi.mocked(mockTicketsService.searchLabels).mockResolvedValue(response);

			const handler = routes.get('GET /api/tickets/labels');
			const result = await handler!({ query: { projectId: 'project-1', q: 'bu' } });

			expect(mockTicketsService.searchLabels).toHaveBeenCalledWith('project-1', 'bu');
			expect(result).toEqual(response);
		});

		it('should pass undefined q when not provided', async () => {
			const response: LabelsResponse = { labels: ['bug', 'auth'] };
			vi.mocked(mockTicketsService.searchLabels).mockResolvedValue(response);

			const handler = routes.get('GET /api/tickets/labels');
			await handler!({ query: { projectId: 'project-1' } });

			expect(mockTicketsService.searchLabels).toHaveBeenCalledWith('project-1', undefined);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/analyze
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/analyze — analyze ticket', () => {
		it('should call service.analyzeTicket with body and return the plan', async () => {
			const body: AnalyzeTicket = {
				description: 'Users cannot log in with SSO',
				projectId: 'project-1',
				clarificationAnswers: { q1: 'answer1' },
			};
			const plan: TicketAnalysisPlan = {
				title: 'Fix SSO login',
				labels: ['bug', 'auth'],
				fields: {},
				complexity: 'medium',
				analysis: 'The SSO flow is broken due to an expired certificate.',
				subTickets: [],
			};
			vi.mocked(mockTicketsService.analyzeTicket).mockResolvedValue(plan);

			const handler = routes.get('POST /api/tickets/analyze');
			const result = await handler!({ body });

			expect(mockTicketsService.analyzeTicket).toHaveBeenCalledWith(body);
			expect(result).toEqual(plan);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/create-with-ai-title
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/create-with-ai-title — create with AI title', () => {
		it('should call service.createWithAiTitle with body and return the ticket', async () => {
			const body: CreateWithAiTitle = {
				projectId: 'project-1',
				description: 'Fix the SSO certificate expiry issue',
			};
			const ticket = makeSampleTicket();
			vi.mocked(mockTicketsService.createWithAiTitle).mockResolvedValue(ticket);

			const handler = routes.get('POST /api/tickets/create-with-ai-title');
			const result = await handler!({ body });

			expect(mockTicketsService.createWithAiTitle).toHaveBeenCalledWith(body);
			expect(result).toEqual(ticket);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/create-from-plan
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/create-from-plan — create from plan', () => {
		it('should call service.createFromPlan with body and return the response', async () => {
			const plan: TicketAnalysisPlan = {
				title: 'Fix SSO login',
				labels: ['bug'],
				fields: {},
				complexity: 'simple',
				analysis: 'Certificate expired.',
				subTickets: [],
			};
			const body: CreateFromPlan = {
				projectId: 'project-1',
				plan,
				originalDescription: 'Users cannot log in with SSO',
			};
			const response: CreateFromPlanResponse = {
				parentTicket: makeSampleTicket(),
				subTickets: [],
				createdFlowIds: [],
				flowValidationWarnings: [],
			};
			vi.mocked(mockTicketsService.createFromPlan).mockResolvedValue(response);

			const handler = routes.get('POST /api/tickets/create-from-plan');
			const result = await handler!({ body });

			expect(mockTicketsService.createFromPlan).toHaveBeenCalledWith(body);
			expect(result).toEqual(response);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:id
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:id — get single ticket', () => {
		it('should return the ticket when found', async () => {
			const ticket = makeSampleTicket();
			vi.mocked(mockTicketsService.getTicketById).mockResolvedValue(ticket);

			const handler = routes.get('GET /api/tickets/:id');
			const result = await handler!({ params: { id: 'ticket-1' } });

			expect(mockTicketsService.getTicketById).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual(ticket);
		});

		it('should throw an error when ticket is not found', async () => {
			vi.mocked(mockTicketsService.getTicketById).mockResolvedValue(null as unknown as Ticket);

			const handler = routes.get('GET /api/tickets/:id');

			await expect(handler!({ params: { id: 'missing-id' } })).rejects.toThrow('Ticket missing-id not found');
		});
	});

	// ---------------------------------------------------------------------------
	// PATCH /api/tickets/:id
	// ---------------------------------------------------------------------------

	describe('PATCH /api/tickets/:id — update ticket', () => {
		it('should call service.updateTicket with id and body and return the updated ticket', async () => {
			const body: UpdateTicket = { title: 'Updated title', version: 1 };
			const updated = { ...makeSampleTicket(), title: 'Updated title', version: 2 };
			vi.mocked(mockTicketsService.updateTicket).mockResolvedValue(updated);

			const handler = routes.get('PATCH /api/tickets/:id');
			const result = await handler!({ params: { id: 'ticket-1' }, body });

			expect(mockTicketsService.updateTicket).toHaveBeenCalledWith('ticket-1', body);
			expect(result).toEqual(updated);
		});

		it('should propagate NotFoundException when service throws', async () => {
			vi.mocked(mockTicketsService.updateTicket).mockRejectedValue(
				new NotFoundException('Ticket not-found not found')
			);

			const handler = routes.get('PATCH /api/tickets/:id');

			await expect(handler!({ params: { id: 'not-found' }, body: { title: 'x', version: 1 } })).rejects.toThrow(
				NotFoundException
			);
		});
	});

	// ---------------------------------------------------------------------------
	// DELETE /api/tickets/:id
	// ---------------------------------------------------------------------------

	describe('DELETE /api/tickets/:id — delete ticket', () => {
		it('should call service.deleteTicket and return result', async () => {
			const deleteResponse = { success: true as const, id: 'ticket-1' };
			vi.mocked(mockTicketsService.deleteTicket).mockResolvedValue(deleteResponse);

			const handler = routes.get('DELETE /api/tickets/:id');
			const result = await handler!({ params: { id: 'ticket-1' } });

			expect(mockTicketsService.deleteTicket).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual(deleteResponse);
		});

		it('should propagate NotFoundException when ticket does not exist', async () => {
			vi.mocked(mockTicketsService.deleteTicket).mockRejectedValue(
				new NotFoundException('Ticket ghost not found')
			);

			const handler = routes.get('DELETE /api/tickets/:id');

			await expect(handler!({ params: { id: 'ghost' } })).rejects.toThrow(NotFoundException);
			expect(mockTicketsService.deleteTicket).toHaveBeenCalledWith('ghost');
		});
	});

	// ---------------------------------------------------------------------------
	// PATCH /api/tickets/:id/reorder
	// ---------------------------------------------------------------------------

	describe('PATCH /api/tickets/:id/reorder — reorder ticket', () => {
		it('should call service.reorderTicket with id and body and return the updated ticket', async () => {
			const body: ReorderTicket = { order: 2000, version: 1 };
			const reordered = { ...makeSampleTicket(), order: 2000, version: 2 };
			vi.mocked(mockTicketsService.reorderTicket).mockResolvedValue(reordered);

			const handler = routes.get('PATCH /api/tickets/:id/reorder');
			const result = await handler!({ params: { id: 'ticket-1' }, body });

			expect(mockTicketsService.reorderTicket).toHaveBeenCalledWith('ticket-1', body);
			expect(result).toEqual(reordered);
		});

		it('should propagate NotFoundException when ticket does not exist', async () => {
			vi.mocked(mockTicketsService.reorderTicket).mockRejectedValue(
				new NotFoundException('Ticket missing not found')
			);

			const handler = routes.get('PATCH /api/tickets/:id/reorder');

			await expect(handler!({ params: { id: 'missing' }, body: { order: 500, version: 1 } })).rejects.toThrow(
				NotFoundException
			);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/comments
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/comments — get comments', () => {
		it('should call service.getComments with ticketId and return the response', async () => {
			const response: TicketCommentsResponse = {
				comments: [
					{
						id: 'comment-1',
						ticketId: 'ticket-1',
						content: 'Looking into this.',
						author: 'user-1',
						createdAt: '2024-01-01T00:00:00.000Z',
					},
				],
			};
			vi.mocked(mockTicketsService.getComments).mockResolvedValue(response);

			const handler = routes.get('GET /api/tickets/:ticketId/comments');
			const result = await handler!({ params: { ticketId: 'ticket-1' } });

			expect(mockTicketsService.getComments).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual(response);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/comments
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/comments — add comment', () => {
		it('should call service.addComment with ticketId and body and return the created comment', async () => {
			const body: CreateTicketComment = { content: 'Investigating now.', author: 'user-2' };
			const created: TicketComment = {
				id: 'comment-2',
				ticketId: 'ticket-1',
				content: 'Investigating now.',
				author: 'user-2',
				createdAt: '2024-01-02T00:00:00.000Z',
			};
			vi.mocked(mockTicketsService.addComment).mockResolvedValue(created);

			const handler = routes.get('POST /api/tickets/:ticketId/comments');
			const result = await handler!({ params: { ticketId: 'ticket-1' }, body });

			expect(mockTicketsService.addComment).toHaveBeenCalledWith('ticket-1', body);
			expect(result).toEqual(created);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/history
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/history — get history', () => {
		it('should call service.getHistory with ticketId and return the response', async () => {
			const response: TicketHistoryResponse = {
				entries: [
					{
						id: 'entry-1',
						ticketId: 'ticket-1',
						event: 'ticket.created',
						timestamp: '2024-01-01T00:00:00.000Z',
						data: {},
					},
				],
			};
			vi.mocked(mockTicketsService.getHistory).mockResolvedValue(response);

			const handler = routes.get('GET /api/tickets/:ticketId/history');
			const result = await handler!({ params: { ticketId: 'ticket-1' } });

			expect(mockTicketsService.getHistory).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual(response);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/feedback
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/feedback — submit feedback', () => {
		it('should call flowFeedbackService.submitFeedback with ticketId and body and return result', async () => {
			const body: CreateFlowFeedback = {
				ticketId: 'ticket-1',
				flowId: 'flow-1',
				taskId: 'task-1',
				rating: 4,
				wentWell: ['Fast execution'],
				wentWrong: [],
				author: 'user-1',
			};
			const feedback = makeSampleFeedback();
			vi.mocked(mockFlowFeedbackService.submitFeedback).mockResolvedValue(feedback);

			const handler = routes.get('POST /api/tickets/:ticketId/feedback');
			const result = await handler!({ params: { ticketId: 'ticket-1' }, body });

			expect(mockFlowFeedbackService.submitFeedback).toHaveBeenCalledWith('ticket-1', body);
			expect(result).toEqual(feedback);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/retrospective
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/retrospective — submit retrospective', () => {
		it('should call flowFeedbackService.submitRetrospective with ticketId and body and return result', async () => {
			const body: CreateFlowRetrospective = {
				ticketId: 'ticket-1',
				flowId: 'flow-1',
				taskId: 'task-1',
				wentWell: ['Clean implementation'],
				wentWrong: ['Missing edge case'],
				suggestions: ['Add more tests'],
				executionSummary: 'Flow executed successfully with minor issues.',
			};
			const retro = makeSampleRetrospective();
			vi.mocked(mockFlowFeedbackService.submitRetrospective).mockResolvedValue(retro);

			const handler = routes.get('POST /api/tickets/:ticketId/retrospective');
			const result = await handler!({ params: { ticketId: 'ticket-1' }, body });

			expect(mockFlowFeedbackService.submitRetrospective).toHaveBeenCalledWith('ticket-1', body);
			expect(result).toEqual(retro);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/retrospective
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/retrospective — get retrospective', () => {
		it('should call flowFeedbackService.getRetrospective with ticketId and return the result', async () => {
			const retro = makeSampleRetrospective();
			vi.mocked(mockFlowFeedbackService.getRetrospective).mockResolvedValue(retro);

			const handler = routes.get('GET /api/tickets/:ticketId/retrospective');
			const result = await handler!({ params: { ticketId: 'ticket-1' } });

			expect(mockFlowFeedbackService.getRetrospective).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual(retro);
		});

		it('should propagate NotFoundException when retrospective does not exist', async () => {
			vi.mocked(mockFlowFeedbackService.getRetrospective).mockRejectedValue(
				new NotFoundException('No retrospective found for ticket ticket-1')
			);

			const handler = routes.get('GET /api/tickets/:ticketId/retrospective');

			await expect(handler!({ params: { ticketId: 'ticket-1' } })).rejects.toThrow(NotFoundException);
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/flow-proposals
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/flow-proposals — list proposals', () => {
		it('should return proposal list wrapped in { items }', async () => {
			const proposals = [makeSampleProposal()];
			vi.mocked(mockFlowProposalsService.getProposals).mockResolvedValue(proposals);

			const handler = routes.get('GET /api/tickets/:ticketId/flow-proposals');
			const result = await handler!({ params: { ticketId: 'ticket-1' } });

			expect(mockFlowProposalsService.getProposals).toHaveBeenCalledWith('ticket-1');
			expect(result).toEqual({ items: proposals });
		});
	});

	// ---------------------------------------------------------------------------
	// GET /api/tickets/:ticketId/flow-proposals/:proposalId
	// ---------------------------------------------------------------------------

	describe('GET /api/tickets/:ticketId/flow-proposals/:proposalId — get single proposal', () => {
		it('should return the proposal when found', async () => {
			const proposal = makeSampleProposal();
			vi.mocked(mockFlowProposalsService.getProposal).mockResolvedValue(proposal);

			const handler = routes.get('GET /api/tickets/:ticketId/flow-proposals/:proposalId');
			const result = await handler!({ params: { ticketId: 'ticket-1', proposalId: 'proposal-1' } });

			expect(mockFlowProposalsService.getProposal).toHaveBeenCalledWith('ticket-1', 'proposal-1');
			expect(result).toEqual(proposal);
		});

		it('should propagate NotFoundException when proposal does not exist', async () => {
			vi.mocked(mockFlowProposalsService.getProposal).mockRejectedValue(
				new NotFoundException('Proposal missing not found')
			);

			const handler = routes.get('GET /api/tickets/:ticketId/flow-proposals/:proposalId');

			await expect(handler!({ params: { ticketId: 'ticket-1', proposalId: 'missing' } })).rejects.toThrow(
				NotFoundException
			);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/request-flow-design
	// ---------------------------------------------------------------------------

	describe('POST /api/tickets/:ticketId/request-flow-design — request flow design', () => {
		it('should call requestFlowDesign with ticketId and optional context', async () => {
			const proposal = makeSampleProposal();
			vi.mocked(mockFlowProposalsService.requestFlowDesign).mockResolvedValue(proposal);

			const handler = routes.get('POST /api/tickets/:ticketId/request-flow-design');
			const result = await handler!({
				params: { ticketId: 'ticket-1' },
				body: { context: 'Focus on auth flow' },
			});

			expect(mockFlowProposalsService.requestFlowDesign).toHaveBeenCalledWith('ticket-1', 'Focus on auth flow');
			expect(result).toEqual(proposal);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/flow-proposals/:proposalId/approve
	// ---------------------------------------------------------------------------

	describe('POST .../approve — approve proposal', () => {
		it('should call approveProposal with ticketId and proposalId', async () => {
			const approved = { ...makeSampleProposal(), status: 'approved' as const };
			vi.mocked(mockFlowProposalsService.approveProposal).mockResolvedValue(approved);

			const handler = routes.get('POST /api/tickets/:ticketId/flow-proposals/:proposalId/approve');
			const result = await handler!({ params: { ticketId: 'ticket-1', proposalId: 'proposal-1' } });

			expect(mockFlowProposalsService.approveProposal).toHaveBeenCalledWith('ticket-1', 'proposal-1');
			expect(result).toEqual(approved);
		});

		it('should propagate NotFoundException when proposal does not exist', async () => {
			vi.mocked(mockFlowProposalsService.approveProposal).mockRejectedValue(
				new NotFoundException('Proposal missing not found')
			);

			const handler = routes.get('POST /api/tickets/:ticketId/flow-proposals/:proposalId/approve');

			await expect(handler!({ params: { ticketId: 'ticket-1', proposalId: 'missing' } })).rejects.toThrow(
				NotFoundException
			);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/flow-proposals/:proposalId/reject
	// ---------------------------------------------------------------------------

	describe('POST .../reject — reject proposal', () => {
		it('should call rejectProposal with ticketId, proposalId, and reason', async () => {
			const rejected = { ...makeSampleProposal(), status: 'rejected' as const };
			vi.mocked(mockFlowProposalsService.rejectProposal).mockResolvedValue(rejected);

			const handler = routes.get('POST /api/tickets/:ticketId/flow-proposals/:proposalId/reject');
			const result = await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1' },
				body: { reason: 'Too complex' },
			});

			expect(mockFlowProposalsService.rejectProposal).toHaveBeenCalledWith(
				'ticket-1',
				'proposal-1',
				'Too complex'
			);
			expect(result).toEqual(rejected);
		});

		it('should call rejectProposal with undefined reason when not provided', async () => {
			const rejected = { ...makeSampleProposal(), status: 'rejected' as const };
			vi.mocked(mockFlowProposalsService.rejectProposal).mockResolvedValue(rejected);

			const handler = routes.get('POST /api/tickets/:ticketId/flow-proposals/:proposalId/reject');
			await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1' },
				body: {},
			});

			expect(mockFlowProposalsService.rejectProposal).toHaveBeenCalledWith('ticket-1', 'proposal-1', undefined);
		});
	});

	// ---------------------------------------------------------------------------
	// POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads
	// ---------------------------------------------------------------------------

	describe('POST .../review-threads — add review thread', () => {
		it('should call addReviewThread with ticketId, proposalId, and body', async () => {
			const thread = makeSampleThread();
			vi.mocked(mockFlowProposalsService.addReviewThread).mockResolvedValue(thread);

			const body: CreateReviewThread = {
				selector: { startLine: 1, endLine: 3 },
				comment: 'This step looks wrong',
				author: 'user-1',
			};

			const handler = routes.get('POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads');
			const result = await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1' },
				body,
			});

			expect(mockFlowProposalsService.addReviewThread).toHaveBeenCalledWith('ticket-1', 'proposal-1', body);
			expect(result).toEqual(thread);
		});
	});

	// ---------------------------------------------------------------------------
	// POST .../review-threads/:threadId/comments
	// ---------------------------------------------------------------------------

	describe('POST .../review-threads/:threadId/comments — add comment to thread', () => {
		it('should call addCommentToThread with all ids and body', async () => {
			const comment = makeSampleComment();
			vi.mocked(mockFlowProposalsService.addCommentToThread).mockResolvedValue(comment);

			const body: AddReviewComment = { content: 'I agree with this concern', author: 'user-2' };

			const handler = routes.get(
				'POST /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments'
			);
			const result = await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1', threadId: 'thread-1' },
				body,
			});

			expect(mockFlowProposalsService.addCommentToThread).toHaveBeenCalledWith(
				'ticket-1',
				'proposal-1',
				'thread-1',
				body
			);
			expect(result).toEqual(comment);
		});
	});

	// ---------------------------------------------------------------------------
	// PATCH .../review-threads/:threadId — update thread
	// ---------------------------------------------------------------------------

	describe('PATCH .../review-threads/:threadId — update thread', () => {
		it('should call updateThread with ticketId, proposalId, threadId, and body', async () => {
			const resolved = { ...makeSampleThread(), status: 'resolved' as const };
			vi.mocked(mockFlowProposalsService.updateThread).mockResolvedValue(resolved);

			const handler = routes.get(
				'PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId'
			);
			const result = await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1', threadId: 'thread-1' },
				body: { status: 'resolved' },
			});

			expect(mockFlowProposalsService.updateThread).toHaveBeenCalledWith('ticket-1', 'proposal-1', 'thread-1', {
				status: 'resolved',
			});
			expect(result).toEqual(resolved);
		});

		it('should propagate NotFoundException when thread does not exist', async () => {
			vi.mocked(mockFlowProposalsService.updateThread).mockRejectedValue(
				new NotFoundException('Thread missing not found')
			);

			const handler = routes.get(
				'PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId'
			);

			await expect(
				handler!({
					params: { ticketId: 'ticket-1', proposalId: 'proposal-1', threadId: 'missing' },
					body: { status: 'resolved' },
				})
			).rejects.toThrow(NotFoundException);
		});
	});

	// ---------------------------------------------------------------------------
	// DELETE .../review-threads/:threadId — delete thread
	// ---------------------------------------------------------------------------

	describe('DELETE .../review-threads/:threadId — delete thread', () => {
		it('should call deleteThread with ticketId, proposalId, and threadId', async () => {
			vi.mocked(mockFlowProposalsService.deleteThread).mockResolvedValue({ success: true });

			const handler = routes.get(
				'DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId'
			);
			const result = await handler!({
				params: { ticketId: 'ticket-1', proposalId: 'proposal-1', threadId: 'thread-1' },
			});

			expect(mockFlowProposalsService.deleteThread).toHaveBeenCalledWith('ticket-1', 'proposal-1', 'thread-1');
			expect(result).toEqual({ success: true });
		});

		it('should propagate NotFoundException when thread does not exist', async () => {
			vi.mocked(mockFlowProposalsService.deleteThread).mockRejectedValue(
				new NotFoundException('Thread missing not found')
			);

			const handler = routes.get(
				'DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId'
			);

			await expect(
				handler!({ params: { ticketId: 'ticket-1', proposalId: 'proposal-1', threadId: 'missing' } })
			).rejects.toThrow(NotFoundException);
		});
	});

	// ---------------------------------------------------------------------------
	// DELETE .../review-threads/:threadId/comments/:commentId — delete comment
	// ---------------------------------------------------------------------------

	describe('DELETE .../review-threads/:threadId/comments/:commentId — delete comment', () => {
		it('should call deleteComment with all ids and return threadDeleted: true when last comment', async () => {
			vi.mocked(mockFlowProposalsService.deleteComment).mockResolvedValue({
				success: true,
				threadDeleted: true,
			});

			const handler = routes.get(
				'DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
			);
			const result = await handler!({
				params: {
					ticketId: 'ticket-1',
					proposalId: 'proposal-1',
					threadId: 'thread-1',
					commentId: 'comment-1',
				},
			});

			expect(mockFlowProposalsService.deleteComment).toHaveBeenCalledWith(
				'ticket-1',
				'proposal-1',
				'thread-1',
				'comment-1'
			);
			expect(result).toEqual({ success: true, threadDeleted: true });
		});

		it('should return threadDeleted: false when other comments remain', async () => {
			vi.mocked(mockFlowProposalsService.deleteComment).mockResolvedValue({
				success: true,
				threadDeleted: false,
			});

			const handler = routes.get(
				'DELETE /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
			);
			const result = await handler!({
				params: {
					ticketId: 'ticket-1',
					proposalId: 'proposal-1',
					threadId: 'thread-1',
					commentId: 'comment-1',
				},
			});

			expect(result).toEqual({ success: true, threadDeleted: false });
		});
	});

	// ---------------------------------------------------------------------------
	// PATCH .../review-threads/:threadId/comments/:commentId — update comment
	// ---------------------------------------------------------------------------

	describe('PATCH .../review-threads/:threadId/comments/:commentId — update comment', () => {
		it('should call updateComment with all ids and body, return updated comment', async () => {
			const updated = { ...makeSampleComment(), content: 'Updated content' };
			vi.mocked(mockFlowProposalsService.updateComment).mockResolvedValue(updated);

			const handler = routes.get(
				'PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
			);
			const result = await handler!({
				params: {
					ticketId: 'ticket-1',
					proposalId: 'proposal-1',
					threadId: 'thread-1',
					commentId: 'comment-1',
				},
				body: { content: 'Updated content' },
			});

			expect(mockFlowProposalsService.updateComment).toHaveBeenCalledWith(
				'ticket-1',
				'proposal-1',
				'thread-1',
				'comment-1',
				{ content: 'Updated content' }
			);
			expect(result).toEqual(updated);
		});

		it('should propagate NotFoundException when comment does not exist', async () => {
			vi.mocked(mockFlowProposalsService.updateComment).mockRejectedValue(
				new NotFoundException('Comment missing not found')
			);

			const handler = routes.get(
				'PATCH /api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId'
			);

			await expect(
				handler!({
					params: {
						ticketId: 'ticket-1',
						proposalId: 'proposal-1',
						threadId: 'thread-1',
						commentId: 'missing',
					},
					body: { content: 'x' },
				})
			).rejects.toThrow(NotFoundException);
		});
	});
});
