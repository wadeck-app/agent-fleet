import { randomUUID } from 'node:crypto';
import type { FlowRegistry } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/src/types';
import { createLogger } from 'shared-common/logger';

import type {
	AddReviewComment,
	CreateReviewThread,
	FlowProposal,
	FlowReviewComment,
	FlowReviewSelector,
	FlowReviewThread,
} from '@app/shared/api/flow-proposals.contract';
import type { Ticket } from '@app/shared/api/tickets.contract';
import { ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';
import { B2F_FLOW_PROPOSAL_UPDATED, B2F_TICKET_UPDATED } from '@app/shared/transport';

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

		// Fetch comments to inject intake action plan into the prompt
		const ticketComments = await this.ticketsRepository.getComments(ticketId);

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
			ticketComments,
		});

		// dl fix: compute version from existing proposals instead of hardcoding 1
		const existingProposals = await this.proposalsRepository.findByTicketId(ticketId);
		const maxVersion = existingProposals.reduce((m, p) => Math.max(m, p.version), 0);

		// Create proposal
		const proposal: FlowProposal = {
			id: randomUUID(),
			ticketId,
			version: maxVersion + 1,
			status: 'pending_review',
			proposedFlow: designOutput.proposedFlow,
			reasoning: designOutput.reasoning,
			reusedFromFlowId: designOutput.reusedFromFlowId,
			reusedSubFlows: designOutput.reusedSubFlows,
			adaptations: designOutput.adaptations,
			confidenceScore: designOutput.confidenceScore,
			openQuestions: designOutput.openQuestions,
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
			version: maxVersion + 1,
		});

		// Notify flow-proposal subscribers so the UI refreshes without page reload (dj fix)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.eventBroadcaster.broadcast(B2F_FLOW_PROPOSAL_UPDATED, { ticketId } as any);

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
		return all.sort(
			(a, b) => b.version - a.version || new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime()
		);
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
	 * Reject a pending proposal and trigger a redesign asynchronously.
	 *
	 * The rejection is saved immediately and this method returns quickly (202 semantics).
	 * The redesign (FlowDesignerAgent call) runs in the background. When complete,
	 * a B2F_TICKET_UPDATED event is broadcast so the UI can refresh the proposal list.
	 *
	 * Returns the REJECTED proposal so the UI can reflect the rejection immediately.
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

		// Mark current proposal as rejected immediately
		const rejectedProposal = await this.proposalsRepository.update(proposalId, {
			status: 'rejected',
			rejectedAt: new Date().toISOString(),
		});

		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.rejected', {
			proposalId,
			version: proposal.version,
			reason,
		});

		log.info('Proposal rejected, triggering async redesign', { ticketId, proposalId });

		// Fire the redesign asynchronously -- do not block the HTTP response
		void this.triggerRedesignAsync(ticketId, proposalId, proposal, ticket);

		return rejectedProposal;
	}

	/**
	 * Run redesign in background after a rejection.
	 * Errors are logged but do not propagate (fire-and-forget).
	 */
	private async triggerRedesignAsync(
		ticketId: string,
		rejectedProposalId: string,
		rejectedProposal: FlowProposal,
		ticket: Ticket
	): Promise<void> {
		try {
			// Build context for redesign
			const knowledgeContext = await this.knowledgeService.buildKnowledgeContext(
				ticket.projectId,
				ticket.description
			);

			// Fetch comments to inject intake action plan into the redesign prompt
			const ticketComments = await this.ticketsRepository.getComments(ticketId);

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
				ticketComments,
				previousProposal: {
					proposedFlowYaml: FlowDesignerAgent.serializeFlowToYaml(
						rejectedProposal.proposedFlow as Record<string, unknown>
					),
					reasoning: rejectedProposal.reasoning,
					reviewThreads: rejectedProposal.reviewThreads,
				},
			});

			// Create new proposal
			const newProposal: FlowProposal = {
				id: randomUUID(),
				ticketId,
				version: rejectedProposal.version + 1,
				status: 'pending_review',
				proposedFlow: designOutput.proposedFlow,
				reasoning: designOutput.reasoning,
				reusedFromFlowId: designOutput.reusedFromFlowId,
				reusedSubFlows: designOutput.reusedSubFlows,
				adaptations: designOutput.adaptations,
				confidenceScore: designOutput.confidenceScore,
				openQuestions: designOutput.openQuestions,
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
				rejectedProposalId,
				newProposalId: created.id,
				version: created.version,
			});

			// Notify the ticket detail page that the ticket changed (e.g. currentFlowProposalId updated)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKET_UPDATED, { ticketId } as any);
			// Notify flow-proposal subscribers specifically -- allows the UI to refresh ONLY the
			// Flow Design tab content without refreshing on unrelated ticket updates (cc fix).
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_FLOW_PROPOSAL_UPDATED, { ticketId } as any);
		} catch (err) {
			log.error('Async redesign failed after rejection', {
				ticketId,
				rejectedProposalId,
				error: err instanceof Error ? String(err) : String(err),
			});
		}
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
	 * Update a review thread's status and/or selector.
	 * When status changes to 'resolved', records a history entry.
	 */
	async updateThread(
		ticketId: string,
		proposalId: string,
		threadId: string,
		data: { status?: 'resolved'; selector?: FlowReviewSelector }
	): Promise<FlowReviewThread> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const updatedThread: FlowReviewThread = {
			...thread,
			...(data.status === 'resolved' && {
				status: 'resolved',
				resolvedAt: new Date().toISOString(),
			}),
			...(data.selector !== undefined && { selector: data.selector }),
		};

		const updatedThreads = proposal.reviewThreads.map(t => (t.id === threadId ? updatedThread : t));
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		if (data.status === 'resolved') {
			await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.review_thread_resolved', {
				proposalId,
				threadId,
			});
		}

		log.info('Thread updated', {
			ticketId,
			proposalId,
			threadId,
			status: data.status,
			hasSelector: !!data.selector,
		});
		return updatedThread;
	}

	/**
	 * @deprecated Use updateThread instead.
	 */
	async resolveThread(ticketId: string, proposalId: string, threadId: string): Promise<FlowReviewThread> {
		return this.updateThread(ticketId, proposalId, threadId, { status: 'resolved' });
	}

	/**
	 * Delete an entire review thread and all its comments.
	 */
	async deleteThread(ticketId: string, proposalId: string, threadId: string): Promise<{ success: true }> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const updatedThreads = proposal.reviewThreads.filter(t => t.id !== threadId);
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		log.info('Thread deleted', { ticketId, proposalId, threadId });
		return { success: true };
	}

	/**
	 * Delete a single comment from a thread.
	 * If the comment is the last one in the thread, the whole thread is deleted.
	 */
	async deleteComment(
		ticketId: string,
		proposalId: string,
		threadId: string,
		commentId: string
	): Promise<{ success: true; threadDeleted: boolean }> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const comment = thread.comments.find(c => c.id === commentId);
		if (!comment) {
			throw new NotFoundException(
				`Comment ${commentId} not found in thread ${threadId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		if (thread.comments.length === 1) {
			// Last comment -- delete the whole thread
			const updatedThreads = proposal.reviewThreads.filter(t => t.id !== threadId);
			await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });
			log.info('Last comment deleted -- thread removed', { ticketId, proposalId, threadId, commentId });
			return { success: true, threadDeleted: true };
		}

		const updatedThread: FlowReviewThread = {
			...thread,
			comments: thread.comments.filter(c => c.id !== commentId),
		};
		const updatedThreads = proposal.reviewThreads.map(t => (t.id === threadId ? updatedThread : t));
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		log.info('Comment deleted', { ticketId, proposalId, threadId, commentId });
		return { success: true, threadDeleted: false };
	}

	/**
	 * Update the content of a specific comment.
	 */
	async updateComment(
		ticketId: string,
		proposalId: string,
		threadId: string,
		commentId: string,
		data: { content: string }
	): Promise<FlowReviewComment> {
		const proposal = await this.getProposal(ticketId, proposalId);

		const thread = proposal.reviewThreads.find(t => t.id === threadId);
		if (!thread) {
			throw new NotFoundException(
				`Thread ${threadId} not found in proposal ${proposalId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const comment = thread.comments.find(c => c.id === commentId);
		if (!comment) {
			throw new NotFoundException(
				`Comment ${commentId} not found in thread ${threadId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}

		const updatedComment: FlowReviewComment = { ...comment, content: data.content };
		const updatedThread: FlowReviewThread = {
			...thread,
			comments: thread.comments.map(c => (c.id === commentId ? updatedComment : c)),
		};
		const updatedThreads = proposal.reviewThreads.map(t => (t.id === threadId ? updatedThread : t));
		await this.proposalsRepository.update(proposalId, { reviewThreads: updatedThreads });

		log.info('Comment updated', { ticketId, proposalId, threadId, commentId });
		return updatedComment;
	}
}
