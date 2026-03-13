import { randomUUID } from 'crypto';
import type { FlowRegistry } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/src/types';
import { createLogger } from 'shared-common/logger';

import type {
	AddReviewComment,
	CreateReviewThread,
	FlowProposal,
	FlowReviewComment,
	FlowReviewThread,
} from '@app/shared/api/flow-proposals.contract';
import { ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';

import { FlowDesignerAgent } from '../agents/FlowDesignerAgent';
import type { FlowProposalsRepository } from '../repositories/FlowProposalsRepository';
import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { FlowKnowledgeService } from './FlowKnowledgeService';

const log = createLogger('FlowProposalsService');

/**
 * ===========================================================================================
 * FLOW PROPOSALS SERVICE
 * ===========================================================================================
 *
 * Business logic for the entire flow proposal lifecycle:
 * - Requesting a flow design (triggers FlowDesignerAgent)
 * - Reviewing proposals (inline comment threads)
 * - Approving / rejecting proposals
 * - Re-design on rejection (FlowDesignerAgent re-invoked with previous proposal context)
 *
 * ===========================================================================================
 */
export class FlowProposalsService {
	constructor(
		private readonly proposalsRepository: FlowProposalsRepository,
		private readonly ticketsRepository: TicketsRepository,
		private readonly designerAgent: FlowDesignerAgent,
		private readonly knowledgeService: FlowKnowledgeService,
		private readonly registry: FlowRegistry,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	// ---------------------------------------------------------------------------
	// Request flow design
	// ---------------------------------------------------------------------------

	/**
	 * Trigger AI flow design for a ticket.
	 * - Updates ticket status to 'flow_analysis'
	 * - Calls FlowDesignerAgent
	 * - Creates a FlowProposal v1 with status 'pending_review'
	 * - Updates ticket with currentFlowProposalId and status 'flow_proposed'
	 */
	async requestFlowDesign(ticketId: string, userContext?: string): Promise<FlowProposal> {
		const ticket = await this.ticketsRepository.findById(ticketId);
		if (!ticket) {
			throw new NotFoundException(`Ticket ${ticketId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
		}

		log.info('Requesting flow design', { ticketId, ticketTitle: ticket.title });

		// Transition ticket to flow_analysis
		await this.ticketsRepository.update(ticketId, { status: 'flow_analysis' });
		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.design_requested', {
			requestedAt: new Date().toISOString(),
		});

		// Build knowledge context
		const knowledgeContext = await this.knowledgeService.buildKnowledgeContext(
			ticket.projectId,
			ticket.description
		);

		// Call FlowDesignerAgent
		const designOutput = await this.designerAgent.designFlow({
			ticket: {
				title: ticket.title,
				description: ticket.description,
				labels: ticket.labels,
				fields: ticket.fields,
			},
			projectId: ticket.projectId,
			knowledgeContext,
			userContext,
		});

		// Create proposal
		const proposal: FlowProposal = {
			id: randomUUID(),
			ticketId,
			version: 1,
			status: 'pending_review',
			proposedFlow: designOutput.proposedFlow,
			reasoning: designOutput.reasoning,
			reusedFromFlowId: designOutput.reusedFromFlowId,
			reusedSubFlows: designOutput.reusedSubFlows,
			adaptations: designOutput.adaptations,
			confidenceScore: designOutput.confidenceScore,
			reviewThreads: [],
			proposedAt: new Date().toISOString(),
		};

		const created = await this.proposalsRepository.create(proposal);

		// Update ticket
		await this.ticketsRepository.update(ticketId, {
			currentFlowProposalId: created.id,
			status: 'flow_proposed',
		});
		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.proposed', {
			proposalId: created.id,
			version: 1,
		});

		log.info('Flow proposal created', { ticketId, proposalId: created.id });
		return created;
	}

	// ---------------------------------------------------------------------------
	// Read
	// ---------------------------------------------------------------------------

	/**
	 * Return all proposals for a ticket, sorted by version descending (newest first).
	 */
	async getProposals(ticketId: string): Promise<FlowProposal[]> {
		const all = await this.proposalsRepository.findByTicketId(ticketId);
		return all.sort((a, b) => b.version - a.version || new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime());
	}

	/**
	 * Return a single proposal, verifying it belongs to the ticket.
	 * Throws NotFoundException if not found or ticket mismatch.
	 */
	async getProposal(ticketId: string, proposalId: string): Promise<FlowProposal> {
		const proposal = await this.proposalsRepository.findById(proposalId);
		if (!proposal || proposal.ticketId !== ticketId) {
			throw new NotFoundException(
				`Proposal ${proposalId} not found for ticket ${ticketId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}
		return proposal;
	}

	// ---------------------------------------------------------------------------
	// Approve
	// ---------------------------------------------------------------------------

	/**
	 * Approve a pending proposal.
	 * - Saves the flow to FlowRegistry (writes flows-custom.yml)
	 * - Updates ticket: flowId set, status → flow_approved
	 * - Updates proposal: status → approved
	 */
	async approveProposal(ticketId: string, proposalId: string): Promise<FlowProposal> {
		const proposal = await this.getProposal(ticketId, proposalId);

		if (proposal.status !== 'pending_review') {
			throw new Error(
				`Cannot approve proposal ${proposalId}: current status is '${proposal.status}', expected 'pending_review'`
			);
		}

		// Save flow to registry
		await this.registry.saveCustomFlow(proposal.proposedFlow as unknown as FlowDefinition);

		const flowId = (proposal.proposedFlow as Record<string, unknown>).id as string | undefined;
		if (!flowId) {
			throw new Error(`Proposal ${proposalId} proposedFlow is missing an 'id' field`);
		}

		// Update ticket
		await this.ticketsRepository.update(ticketId, {
			flowId,
			status: 'flow_approved',
		});
		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.approved', {
			proposalId,
			version: proposal.version,
			flowId,
		});

		// Update proposal
		const updated = await this.proposalsRepository.update(proposalId, {
			status: 'approved',
			approvedAt: new Date().toISOString(),
		});

		log.info('Proposal approved', { ticketId, proposalId, flowId });
		return updated;
	}

	// ---------------------------------------------------------------------------
	// Reject
	// ---------------------------------------------------------------------------

	/**
	 * Reject a pending proposal and immediately trigger a redesign.
	 * - Marks the current proposal as rejected
	 * - Re-invokes FlowDesignerAgent with the rejected proposal as context
	 * - Creates a new proposal (version N+1) with status pending_review
	 * - Updates ticket with the new proposal ID
	 *
	 * Returns the NEW proposal (so the UI can show it immediately).
	 */
	async rejectProposal(ticketId: string, proposalId: string, reason?: string): Promise<FlowProposal> {
		const proposal = await this.getProposal(ticketId, proposalId);

		if (proposal.status !== 'pending_review') {
			throw new Error(
				`Cannot reject proposal ${proposalId}: current status is '${proposal.status}', expected 'pending_review'`
			);
		}

		const ticket = await this.ticketsRepository.findById(ticketId);
		if (!ticket) {
			throw new NotFoundException(`Ticket ${ticketId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
		}

		// Mark current proposal as rejected
		await this.proposalsRepository.update(proposalId, {
			status: 'rejected',
			rejectedAt: new Date().toISOString(),
		});

		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.rejected', {
			proposalId,
			version: proposal.version,
			reason,
		});

		log.info('Proposal rejected, triggering redesign', { ticketId, proposalId });

		// Build context for redesign
		const knowledgeContext = await this.knowledgeService.buildKnowledgeContext(
			ticket.projectId,
			ticket.description
		);

		// Re-invoke FlowDesignerAgent with previous proposal as context
		const designOutput = await this.designerAgent.designFlow({
			ticket: {
				title: ticket.title,
				description: ticket.description,
				labels: ticket.labels,
				fields: ticket.fields,
			},
			projectId: ticket.projectId,
			knowledgeContext,
			previousProposal: {
				proposedFlowYaml: FlowDesignerAgent.serializeFlowToYaml(
					proposal.proposedFlow as Record<string, unknown>
				),
				reasoning: proposal.reasoning,
				reviewThreads: proposal.reviewThreads,
			},
		});

		// Create new proposal
		const newProposal: FlowProposal = {
			id: randomUUID(),
			ticketId,
			version: proposal.version + 1,
			status: 'pending_review',
			proposedFlow: designOutput.proposedFlow,
			reasoning: designOutput.reasoning,
			reusedFromFlowId: designOutput.reusedFromFlowId,
			reusedSubFlows: designOutput.reusedSubFlows,
			adaptations: designOutput.adaptations,
			confidenceScore: designOutput.confidenceScore,
			reviewThreads: [],
			proposedAt: new Date().toISOString(),
		};

		const created = await this.proposalsRepository.create(newProposal);

		// Update ticket
		await this.ticketsRepository.update(ticketId, {
			currentFlowProposalId: created.id,
			status: 'flow_proposed',
		});
		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.proposed', {
			proposalId: created.id,
			version: created.version,
		});

		log.info('New proposal created after rejection', {
			ticketId,
			newProposalId: created.id,
			version: created.version,
		});
		return created;
	}

	// ---------------------------------------------------------------------------
	// Review threads
	// ---------------------------------------------------------------------------

	/**
	 * Add an inline review thread with an initial comment.
	 */
	async addReviewThread(ticketId: string, proposalId: string, data: CreateReviewThread): Promise<FlowReviewThread> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const now = new Date().toISOString();
		const threadId = randomUUID();

		const comment: FlowReviewComment = {
			id: randomUUID(),
			threadId,
			content: data.comment,
			author: data.author ?? 'user',
			createdAt: now,
		};

		const thread: FlowReviewThread = {
			id: threadId,
			proposalId,
			selector: data.selector,
			status: 'open',
			comments: [comment],
			createdAt: now,
		};

		const updatedThreads = [...proposal.reviewThreads, thread];
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.review_comment_added', {
			proposalId,
			threadId,
			startLine: data.selector.startLine,
			endLine: data.selector.endLine,
		});

		log.info('Review thread added', { ticketId, proposalId, threadId });
		return thread;
	}

	/**
	 * Add a comment to an existing review thread.
	 */
	async addCommentToThread(
		ticketId: string,
		proposalId: string,
		threadId: string,
		data: AddReviewComment
	): Promise<FlowReviewComment> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const comment: FlowReviewComment = {
			id: randomUUID(),
			threadId,
			content: data.content,
			author: data.author ?? 'user',
			createdAt: new Date().toISOString(),
		};

		const updatedThread: FlowReviewThread = {
			...thread,
			comments: [...thread.comments, comment],
		};

		const updatedThreads = proposal.reviewThreads.map(t => (t.id === threadId ? updatedThread : t));
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		log.info('Comment added to thread', { ticketId, proposalId, threadId, commentId: comment.id });
		return comment;
	}

	/**
	 * Mark a review thread as resolved.
	 */
	async resolveThread(ticketId: string, proposalId: string, threadId: string): Promise<FlowReviewThread> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const resolvedThread: FlowReviewThread = {
			...thread,
			status: 'resolved',
			resolvedAt: new Date().toISOString(),
		};

		const updatedThreads = proposal.reviewThreads.map(t => (t.id === threadId ? resolvedThread : t));
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.review_thread_resolved', {
			proposalId,
			threadId,
		});

		log.info('Thread resolved', { ticketId, proposalId, threadId });
		return resolvedThread;
	}
}
