import { z } from 'zod';

import { defineRoutes } from '../route-builder';

export const FlowProposalStatusSchema = z.enum(['pending_review', 'approved', 'rejected', 'superseded']);

export const FlowReviewSelectorSchema = z.object({
	startLine: z.number().int(),
	endLine: z.number().int(),
	startChar: z.number().int().optional(),
	endChar: z.number().int().optional(),
	selectedText: z.string().optional(),
});

export const FlowReviewCommentSchema = z.object({
	id: z.string(),
	threadId: z.string(),
	content: z.string(),
	author: z.string(),
	createdAt: z.string(),
});

export const FlowReviewThreadSchema = z.object({
	id: z.string(),
	proposalId: z.string(),
	selector: FlowReviewSelectorSchema,
	status: z.enum(['open', 'resolved', 'stale']),
	comments: z.array(FlowReviewCommentSchema),
	createdAt: z.string(),
	resolvedAt: z.string().optional(),
});

// FlowDefinition as stored in proposal -- store as z.record(z.string(), z.unknown()) to avoid
// circular type dependency with flow-engine. The backend will validate with FlowValidator separately.
export const StoredFlowDefinitionSchema = z.record(z.string(), z.unknown());

export const FlowProposalSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	version: z.number().int(),
	status: FlowProposalStatusSchema,
	// FlowDefinition as plain object
	proposedFlow: StoredFlowDefinitionSchema,
	reasoning: z.string(),
	reusedFromFlowId: z.string().optional(),
	reusedSubFlows: z.array(z.string()).optional(),
	adaptations: z.array(z.string()).optional(),
	confidenceScore: z.number().optional(),
	openQuestions: z.array(z.string()).optional(),
	reviewThreads: z.array(FlowReviewThreadSchema),
	proposedAt: z.string(),
	approvedAt: z.string().optional(),
	rejectedAt: z.string().optional(),
});

// Request/response schemas
export const CreateReviewThreadSchema = z.object({
	selector: FlowReviewSelectorSchema,
	comment: z.string().min(1),
	author: z.string().optional(),
});

export const AddReviewCommentSchema = z.object({
	content: z.string().min(1),
	author: z.string().optional(),
});

export const UpdateReviewThreadSchema = z.object({
	status: z.enum(['resolved']).optional(),
	selector: FlowReviewSelectorSchema.optional(),
});

export const UpdateReviewCommentSchema = z.object({
	content: z.string().min(1),
});

export const RequestFlowDesignSchema = z.object({
	/** Optional override prompt/context from the user */
	context: z.string().optional(),
	/** Answers to open questions surfaced by the AI in a previous proposal */
	questionsContext: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export const RejectProposalSchema = z.object({
	reason: z.string().optional(),
});

export const ApproveProposalSchema = z.object({});

export type FlowProposalStatus = z.infer<typeof FlowProposalStatusSchema>;
export type FlowReviewSelector = z.infer<typeof FlowReviewSelectorSchema>;
export type FlowReviewComment = z.infer<typeof FlowReviewCommentSchema>;
export type FlowReviewThread = z.infer<typeof FlowReviewThreadSchema>;
export type FlowProposal = z.infer<typeof FlowProposalSchema>;
export type CreateReviewThread = z.infer<typeof CreateReviewThreadSchema>;
export type AddReviewComment = z.infer<typeof AddReviewCommentSchema>;
export type UpdateReviewComment = z.infer<typeof UpdateReviewCommentSchema>;

export const FLOW_PROPOSALS_API_ROUTES = defineRoutes({
	'/api/tickets/:ticketId/request-flow-design': {
		POST: {
			params: z.object({ ticketId: z.string() }),
			body: RequestFlowDesignSchema,
			response: FlowProposalSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals': {
		GET: {
			params: z.object({ ticketId: z.string() }),
			response: z.object({ items: z.array(FlowProposalSchema) }),
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId': {
		GET: {
			params: z.object({ ticketId: z.string(), proposalId: z.string() }),
			response: FlowProposalSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/approve': {
		POST: {
			params: z.object({ ticketId: z.string(), proposalId: z.string() }),
			body: ApproveProposalSchema,
			response: FlowProposalSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/reject': {
		POST: {
			params: z.object({ ticketId: z.string(), proposalId: z.string() }),
			body: RejectProposalSchema,
			response: FlowProposalSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads': {
		POST: {
			params: z.object({ ticketId: z.string(), proposalId: z.string() }),
			body: CreateReviewThreadSchema,
			response: FlowReviewThreadSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments': {
		POST: {
			params: z.object({ ticketId: z.string(), proposalId: z.string(), threadId: z.string() }),
			body: AddReviewCommentSchema,
			response: FlowReviewCommentSchema,
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId': {
		PATCH: {
			params: z.object({ ticketId: z.string(), proposalId: z.string(), threadId: z.string() }),
			body: UpdateReviewThreadSchema,
			response: FlowReviewThreadSchema,
		},
		DELETE: {
			params: z.object({ ticketId: z.string(), proposalId: z.string(), threadId: z.string() }),
			response: z.object({ success: z.literal(true) }),
		},
	},
	'/api/tickets/:ticketId/flow-proposals/:proposalId/review-threads/:threadId/comments/:commentId': {
		DELETE: {
			params: z.object({
				ticketId: z.string(),
				proposalId: z.string(),
				threadId: z.string(),
				commentId: z.string(),
			}),
			response: z.object({ success: z.literal(true), threadDeleted: z.boolean() }),
		},
		PATCH: {
			params: z.object({
				ticketId: z.string(),
				proposalId: z.string(),
				threadId: z.string(),
				commentId: z.string(),
			}),
			body: UpdateReviewCommentSchema,
			response: FlowReviewCommentSchema,
		},
	},
});

export type FlowProposalsApiRoutes = typeof FLOW_PROPOSALS_API_ROUTES;
