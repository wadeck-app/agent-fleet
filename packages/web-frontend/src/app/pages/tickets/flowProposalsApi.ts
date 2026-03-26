import { createTypedFetch } from '@framework/api/api-base';
import type {
	AddReviewComment,
	CreateReviewThread,
	FlowProposal,
	FlowReviewComment,
	FlowReviewThread,
} from '@shared/api/flow-proposals.contract';
import { FLOW_PROPOSALS_API_ROUTES } from '@shared/api/flow-proposals.contract';

/**
 * ===========================================================================================
 * FLOW PROPOSALS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for flow proposals endpoints.
 * Generated from the FLOW_PROPOSALS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(FLOW_PROPOSALS_API_ROUTES);

export const flowProposalsApi = {
	/**
	 * Request an AI-generated flow design for a ticket
	 */
	requestFlowDesign: (
		ticketId: string,
		context?: string,
		questionsContext?: Array<{ question: string; answer: string }>
	): Promise<FlowProposal> => {
		return typedFetch('POST', '/api/tickets/:ticketId/request-flow-design', {
			params: { ticketId },
			body: { context, questionsContext },
		});
	},

	/**
	 * Get all flow proposals for a ticket
	 */
	getFlowProposals: (ticketId: string): Promise<{ items: FlowProposal[] }> => {
		return typedFetch('GET', '/api/tickets/:ticketId/flow-proposals', {
			params: { ticketId },
		});
	},

	/**
	 * Get a single flow proposal by ID
	 */
	getFlowProposal: (ticketId: string, proposalId: string): Promise<FlowProposal> => {
		return typedFetch('GET', '/api/tickets/:ticketId/flow-proposals/:proposalId', {
			params: { ticketId, proposalId },
		});
	},

	/**
	 * Approve a flow proposal
	 */
	approveProposal: (ticketId: string, proposalId: string): Promise<FlowProposal> => {
		return typedFetch('POST', '/api/tickets/:ticketId/flow-proposals/:proposalId/approve', {
			params: { ticketId, proposalId },
			body: {},
		});
	},

	/**
	 * Reject a flow proposal
	 */
	rejectProposal: (ticketId: string, proposalId: string, reason?: string): Promise<FlowProposal> => {
		return typedFetch('POST', '/api/tickets/:ticketId/flow-proposals/:proposalId/reject', {
			params: { ticketId, proposalId },
			body: { reason },
		});
	},

	/**
	 * Add a review thread (inline comment) on a proposal
	 */
	createReviewThread: (ticketId: string, proposalId: string, body: CreateReviewThread): Promise<FlowReviewThread> => {
		return typedFetch('POST', '/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads', {
			params: { ticketId, proposalId },
			body,
		});
	},

	/**
	 * Reply to an existing review thread
	 */
	addReviewComment: (
		ticketId: string,
		proposalId: string,
		threadId: string,
		body: AddReviewComment
	): Promise<FlowReviewComment> => {
		return typedFetch(
			'POST',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments',
			{
				params: { ticketId, proposalId, threadId },
				body,
			}
		);
	},

	/**
	 * Resolve a review thread
	 */
	resolveReviewThread: (ticketId: string, proposalId: string, threadId: string): Promise<FlowReviewThread> => {
		return typedFetch('PATCH', '/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId', {
			params: { ticketId, proposalId, threadId },
			body: { status: 'resolved' },
		});
	},

	/**
	 * Delete a review thread and all its comments
	 */
	deleteThread: (ticketId: string, proposalId: string, threadId: string): Promise<{ success: true }> => {
		return typedFetch('DELETE', '/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId', {
			params: { ticketId, proposalId, threadId },
		});
	},

	/**
	 * Delete a single comment from a review thread.
	 * If the deleted comment was the last one, threadDeleted will be true.
	 */
	deleteComment: (
		ticketId: string,
		proposalId: string,
		threadId: string,
		commentId: string
	): Promise<{ success: true; threadDeleted: boolean }> => {
		return typedFetch(
			'DELETE',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId',
			{
				params: { ticketId, proposalId, threadId, commentId },
			}
		);
	},

	/**
	 * Update a review thread selector (line range / selected text)
	 */
	updateThread: (
		ticketId: string,
		proposalId: string,
		threadId: string,
		data: { selector?: { startLine: number; endLine: number; selectedText?: string } }
	): Promise<FlowReviewThread> => {
		return typedFetch('PATCH', '/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId', {
			params: { ticketId, proposalId, threadId },
			body: data,
		});
	},

	/**
	 * Edit the content of a single review comment
	 */
	updateComment: (
		ticketId: string,
		proposalId: string,
		threadId: string,
		commentId: string,
		data: { content: string }
	): Promise<FlowReviewComment> => {
		return typedFetch(
			'PATCH',
			'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId',
			{
				params: { ticketId, proposalId, threadId, commentId },
				body: data,
			}
		);
	},
} as const;
