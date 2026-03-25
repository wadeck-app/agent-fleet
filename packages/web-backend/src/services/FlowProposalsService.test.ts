import type { FlowRegistry } from 'flow-engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowProposal } from '@app/shared/api/flow-proposals.contract';
import type { Ticket } from '@app/shared/api/tickets.contract';

import type { FlowDesignerAgent } from '../agents/FlowDesignerAgent';
import type { FlowProposalsRepository } from '../repositories/FlowProposalsRepository';
import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { FlowKnowledgeService } from './FlowKnowledgeService';
import { FlowProposalsService } from './FlowProposalsService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides?: Partial<Ticket>): Ticket {
	return {
		id: 'ticket-1',
		projectId: 'proj-1',
		title: 'Test Ticket',
		description: 'Implement something',
		status: 'todo',
		labels: [],
		fields: {},
		taskIds: [],
		order: 1000,
		version: 1,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function makeProposal(overrides?: Partial<FlowProposal>): FlowProposal {
	return {
		id: 'prop-1',
		ticketId: 'ticket-1',
		version: 1,
		status: 'pending_review',
		proposedFlow: { id: 'my-flow', version: '1.0.0', name: 'My Flow', steps: [] },
		reasoning: 'Design reasoning',
		reviewThreads: [],
		proposedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function makeDesignOutput() {
	return {
		proposedFlow: { id: 'designed-flow', version: '1.0.0', name: 'Designed Flow', steps: [] },
		reasoning: 'This is the design rationale',
		confidenceScore: 80,
	};
}

function makeStubs() {
	const proposalsRepository: FlowProposalsRepository = {
		create: vi.fn(),
		findById: vi.fn(),
		findByTicketId: vi.fn(),
		update: vi.fn(),
		findCurrentForTicket: vi.fn(),
	} as unknown as FlowProposalsRepository;

	const ticketsRepository: TicketsRepository = {
		findById: vi.fn(),
		update: vi.fn(),
		addHistoryEntry: vi.fn(),
		findByProject: vi.fn(),
		getComments: vi.fn().mockResolvedValue([]),
	} as unknown as TicketsRepository;

	const designerAgent: FlowDesignerAgent = {
		designFlow: vi.fn(),
	} as unknown as FlowDesignerAgent;

	const knowledgeService: FlowKnowledgeService = {
		buildKnowledgeContext: vi.fn().mockResolvedValue({
			availableFlows: [],
			reusableSubFlows: [],
			feedbackByFlow: {},
			recentRetrospectives: [],
			similarTickets: [],
		}),
	} as unknown as FlowKnowledgeService;

	const registry: FlowRegistry = {
		saveCustomFlow: vi.fn(),
		validateFlow: vi.fn().mockReturnValue({ valid: true, issues: [], summary: { errors: 0, warnings: 0 } }),
	} as unknown as FlowRegistry;

	const eventBroadcaster: EventBroadcaster = {
		broadcast: vi.fn(),
	} as unknown as EventBroadcaster;

	return { proposalsRepository, ticketsRepository, designerAgent, knowledgeService, registry, eventBroadcaster };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowProposalsService', () => {
	let service: FlowProposalsService;
	let stubs: ReturnType<typeof makeStubs>;

	beforeEach(() => {
		stubs = makeStubs();
		service = new FlowProposalsService(
			stubs.proposalsRepository,
			stubs.ticketsRepository,
			stubs.designerAgent,
			stubs.knowledgeService,
			stubs.registry,
			stubs.eventBroadcaster
		);
	});

	// ---------------------------------------------------------------------------
	// requestFlowDesign
	// ---------------------------------------------------------------------------

	describe('requestFlowDesign', () => {
		it('creates a pending_review proposal and transitions ticket status', async () => {
			const ticket = makeTicket();
			const proposal = makeProposal({ id: 'new-prop' });

			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([]);
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue({ ...ticket });
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			const result = await service.requestFlowDesign('ticket-1');

			expect(result).toBe(proposal);

			// Status transitions
			expect(stubs.ticketsRepository.update).toHaveBeenCalledWith('ticket-1', { status: 'flow_analysis' });
			expect(stubs.ticketsRepository.update).toHaveBeenCalledWith(
				'ticket-1',
				expect.objectContaining({
					currentFlowProposalId: proposal.id,
					status: 'flow_proposed',
				})
			);

			// History events
			expect(stubs.ticketsRepository.addHistoryEntry).toHaveBeenCalledWith(
				'ticket-1',
				'flow.design_requested',
				expect.any(Object)
			);
			expect(stubs.ticketsRepository.addHistoryEntry).toHaveBeenCalledWith(
				'ticket-1',
				'flow.proposed',
				expect.objectContaining({ proposalId: proposal.id, version: 1 })
			);
		});

		it('throws NotFoundException when ticket is not found', async () => {
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(null);

			await expect(service.requestFlowDesign('nonexistent')).rejects.toThrow('Ticket nonexistent not found');
		});

		it('passes ticketComments to designerAgent (intake action plan injection)', async () => {
			const ticket = makeTicket();
			const intakeComment = {
				id: 'cmt-1',
				ticketId: 'ticket-1',
				content: 'Action plan: step 1 — analyze, step 2 — implement',
				author: 'worker-ai:ticket-intake',
				createdAt: '2026-01-01T00:00:00Z',
			};
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.getComments as ReturnType<typeof vi.fn>).mockResolvedValue([
				intakeComment,
			]);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([]);
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(makeProposal());
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			await service.requestFlowDesign('ticket-1');

			expect(stubs.designerAgent.designFlow).toHaveBeenCalledWith(
				expect.objectContaining({
					ticketComments: [intakeComment],
				})
			);
		});

		it('passes userContext to designerAgent', async () => {
			const ticket = makeTicket();
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([]);
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(makeProposal());
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			await service.requestFlowDesign('ticket-1', 'Please focus on error handling');

			expect(stubs.designerAgent.designFlow).toHaveBeenCalledWith(
				expect.objectContaining({ userContext: 'Please focus on error handling' })
			);
		});
	});

	// ---------------------------------------------------------------------------
	// approveProposal
	// ---------------------------------------------------------------------------

	describe('approveProposal', () => {
		it('saves flow to registry, updates ticket and proposal', async () => {
			const proposal = makeProposal();
			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue({
				...proposal,
				status: 'approved',
				approvedAt: '2026-01-02T00:00:00Z',
			});
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(makeTicket());
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			const result = await service.approveProposal('ticket-1', 'prop-1');

			expect(stubs.registry.saveCustomFlow).toHaveBeenCalledWith(proposal.proposedFlow);
			expect(stubs.ticketsRepository.update).toHaveBeenCalledWith(
				'ticket-1',
				expect.objectContaining({
					flowId: 'my-flow',
					status: 'flow_approved',
				})
			);
			expect(stubs.proposalsRepository.update).toHaveBeenCalledWith(
				'prop-1',
				expect.objectContaining({
					status: 'approved',
				})
			);
			expect(result.status).toBe('approved');
		});

		it('throws when proposal is not pending_review', async () => {
			const proposal = makeProposal({ status: 'approved' });
			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);

			await expect(service.approveProposal('ticket-1', 'prop-1')).rejects.toThrow(/current status is 'approved'/);
		});

		it('throws when proposedFlow is missing id', async () => {
			const proposal = makeProposal({ proposedFlow: { version: '1.0.0' } });
			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.registry.saveCustomFlow as any).mockResolvedValue(undefined);

			await expect(service.approveProposal('ticket-1', 'prop-1')).rejects.toThrow(/missing an 'id' field/);
		});
	});

	// ---------------------------------------------------------------------------
	// rejectProposal
	// ---------------------------------------------------------------------------

	describe('rejectProposal', () => {
		it('rejects proposal immediately and returns rejected proposal (not the new one)', async () => {
			const proposal = makeProposal({ version: 1 });
			const ticket = makeTicket();
			const rejectedProposal = { ...proposal, status: 'rejected' as const, rejectedAt: '2026-01-02T00:00:00Z' };

			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([proposal]);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue(rejectedProposal);
			// designFlow is called async — stub it to resolve eventually
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(makeProposal({ id: 'prop-2', version: 2 }));
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			const result = await service.rejectProposal('ticket-1', 'prop-1', 'Not enough steps');

			// Returns rejected proposal immediately (not the redesigned one)
			expect(result).toBe(rejectedProposal);
			expect(result.status).toBe('rejected');

			// Old proposal marked as rejected
			expect(stubs.proposalsRepository.update).toHaveBeenCalledWith(
				'prop-1',
				expect.objectContaining({ status: 'rejected' })
			);

			// History event for rejection recorded synchronously
			expect(stubs.ticketsRepository.addHistoryEntry).toHaveBeenCalledWith(
				'ticket-1',
				'flow.rejected',
				expect.objectContaining({ proposalId: 'prop-1', reason: 'Not enough steps' })
			);
		});

		it('triggers async redesign after rejection', async () => {
			const proposal = makeProposal({ version: 1 });
			const ticket = makeTicket();
			const newProposal = makeProposal({ id: 'prop-2', version: 2 });

			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([proposal]);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue({ ...proposal, status: 'rejected' as const });
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(newProposal);
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			await service.rejectProposal('ticket-1', 'prop-1', 'Not enough steps');

			// Allow async redesign microtasks to flush
			await new Promise(resolve => setTimeout(resolve, 0));

			// New proposal created asynchronously
			expect(stubs.proposalsRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({ version: 2, status: 'pending_review' })
			);

			// Ticket updated and B2F event broadcast after redesign
			expect(stubs.eventBroadcaster.broadcast).toHaveBeenCalledWith(
				'b2f:ticket:updated',
				expect.objectContaining({ ticketId: 'ticket-1' })
			);
		});

		it('passes ticketComments to designerAgent on redesign (intake action plan injection)', async () => {
			const proposal = makeProposal();
			const ticket = makeTicket();
			const intakeComment = {
				id: 'cmt-1',
				ticketId: 'ticket-1',
				content: 'Action plan: step 1 — analyze',
				author: 'worker-ai:ticket-intake',
				createdAt: '2026-01-01T00:00:00Z',
			};

			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.getComments as ReturnType<typeof vi.fn>).mockResolvedValue([
				intakeComment,
			]);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([proposal]);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue({ ...proposal, status: 'rejected' as const });
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(makeProposal({ id: 'prop-2', version: 2 }));
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			await service.rejectProposal('ticket-1', 'prop-1');

			// Allow async redesign microtasks to flush
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(stubs.designerAgent.designFlow).toHaveBeenCalledWith(
				expect.objectContaining({
					ticketComments: [intakeComment],
				})
			);
		});

		it('passes previous proposal context to designerAgent on redesign', async () => {
			const proposal = makeProposal();
			const ticket = makeTicket();

			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.findById).mockResolvedValue(ticket);
			vi.mocked(stubs.proposalsRepository.findByTicketId).mockResolvedValue([proposal]);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue({ ...proposal, status: 'rejected' as const });
			vi.mocked(stubs.designerAgent.designFlow).mockResolvedValue(makeDesignOutput());
			vi.mocked(stubs.proposalsRepository.create).mockResolvedValue(makeProposal({ id: 'prop-2', version: 2 }));
			vi.mocked(stubs.ticketsRepository.update).mockResolvedValue(ticket);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			await service.rejectProposal('ticket-1', 'prop-1');

			// Allow async redesign microtasks to flush
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(stubs.designerAgent.designFlow).toHaveBeenCalledWith(
				expect.objectContaining({
					previousProposal: expect.objectContaining({
						reasoning: proposal.reasoning,
						reviewThreads: proposal.reviewThreads,
					}),
				})
			);
		});
	});

	// ---------------------------------------------------------------------------
	// addReviewThread
	// ---------------------------------------------------------------------------

	describe('addReviewThread', () => {
		it('adds a thread with the initial comment', async () => {
			const proposal = makeProposal();
			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			const thread = await service.addReviewThread('ticket-1', 'prop-1', {
				selector: { startLine: 5, endLine: 7 },
				comment: 'This step is wrong',
				author: 'alice',
			});

			expect(thread.status).toBe('open');
			expect(thread.comments).toHaveLength(1);
			expect(thread.comments[0]?.content).toBe('This step is wrong');
			expect(thread.comments[0]?.author).toBe('alice');
			expect(stubs.ticketsRepository.addHistoryEntry).toHaveBeenCalledWith(
				'ticket-1',
				'flow.review_comment_added',
				expect.any(Object)
			);
		});
	});

	// ---------------------------------------------------------------------------
	// resolveThread
	// ---------------------------------------------------------------------------

	describe('resolveThread', () => {
		it('marks thread as resolved and records history event', async () => {
			const thread = {
				id: 'thread-1',
				proposalId: 'prop-1',
				selector: { startLine: 1, endLine: 2 },
				status: 'open' as const,
				comments: [],
				createdAt: '2026-01-01T00:00:00Z',
			};
			const proposal = makeProposal({ reviewThreads: [thread] });

			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);
			vi.mocked(stubs.proposalsRepository.update).mockResolvedValue(proposal);
			vi.mocked(stubs.ticketsRepository.addHistoryEntry).mockResolvedValue({} as any);

			const resolved = await service.resolveThread('ticket-1', 'prop-1', 'thread-1');

			expect(resolved.status).toBe('resolved');
			expect(resolved.resolvedAt).toBeDefined();
			expect(stubs.ticketsRepository.addHistoryEntry).toHaveBeenCalledWith(
				'ticket-1',
				'flow.review_thread_resolved',
				expect.any(Object)
			);
		});

		it('throws NotFoundException when thread is not found', async () => {
			const proposal = makeProposal({ reviewThreads: [] });
			vi.mocked(stubs.proposalsRepository.findById).mockResolvedValue(proposal);

			await expect(service.resolveThread('ticket-1', 'prop-1', 'nonexistent')).rejects.toThrow(
				/Thread nonexistent not found/
			);
		});
	});
});
