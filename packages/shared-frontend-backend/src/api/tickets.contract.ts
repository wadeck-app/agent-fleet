import { z } from 'zod';

import { BaseListQuerySchema, DeleteResponseSchema, createListResponseSchema } from '../common/api-helpers';
import { defineRoutes } from '../route-builder';
import {
	CreateFlowFeedbackSchema,
	CreateFlowRetrospectiveSchema,
	FlowFeedbackSchema,
	FlowRetrospectiveSchema,
} from './flow-feedback.contract';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// Status is project-configurable — accept any string value.
export const TicketStatusSchema = z.string();

// ---------------------------------------------------------------------------
// Core Ticket schema
// ---------------------------------------------------------------------------

export const TicketSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	title: z.string(),
	description: z.string(),
	status: TicketStatusSchema,
	labels: z.array(z.string()),
	fields: z.record(z.string(), z.string()),
	parentId: z.string().optional(),
	taskIds: z.array(z.string()),
	flowId: z.string().optional(),
	currentFlowProposalId: z.string().optional(),
	flowFeedbackId: z.string().optional(),
	flowRetrospectiveId: z.string().optional(),
	/** Float order for drag-and-drop sorting (Jira midpoint strategy) */
	order: z.number(),
	version: z.number().int().positive(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ---------------------------------------------------------------------------
// Comment schemas
// ---------------------------------------------------------------------------

export const TicketCommentSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	content: z.string(),
	author: z.string().optional(),
	createdAt: z.string(),
});
export type TicketComment = z.infer<typeof TicketCommentSchema>;

export const CreateTicketCommentSchema = z.object({
	content: z.string().min(1),
	author: z.string().optional(),
});
export type CreateTicketComment = z.infer<typeof CreateTicketCommentSchema>;

export const TicketCommentsResponseSchema = z.object({
	comments: z.array(TicketCommentSchema),
});
export type TicketCommentsResponse = z.infer<typeof TicketCommentsResponseSchema>;

// ---------------------------------------------------------------------------
// Ticket history (audit log / event trail)
// ---------------------------------------------------------------------------

export const TicketHistoryEventSchema = z.enum([
	'ticket.created',
	'ticket.updated',
	'ticket.transitioned',
	'ticket.comment_created',
	'flow.design_requested',
	'flow.proposed',
	'flow.review_comment_added',
	'flow.review_thread_resolved',
	'flow.approved',
	'flow.rejected',
	'flow.feedback_submitted',
	'flow.feedback_updated',
	'flow.feedback_deleted',
	'flow.retrospective_generated',
]);

export const TicketHistoryEntrySchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	event: TicketHistoryEventSchema,
	timestamp: z.string(),
	/** Who triggered the event (user, worker-ai, etc.) */
	author: z.string().optional(),
	/** Event-specific payload: changed fields, old/new values, comment content, etc. */
	data: z.record(z.string(), z.unknown()),
});
export type TicketHistoryEntry = z.infer<typeof TicketHistoryEntrySchema>;

export const TicketHistoryResponseSchema = z.object({
	entries: z.array(TicketHistoryEntrySchema),
});

// ---------------------------------------------------------------------------
// Query / list schemas
// ---------------------------------------------------------------------------

export const TicketsQuerySchema = BaseListQuerySchema.extend({
	projectId: z.string().optional(),
	status: TicketStatusSchema.optional(),
	parentId: z.string().optional(),
	label: z.string().optional(),
});

export const TicketsListResponseSchema = createListResponseSchema(TicketSchema);

// ---------------------------------------------------------------------------
// Create / update schemas
// ---------------------------------------------------------------------------

export const CreateTicketSchema = z.object({
	projectId: z.string().min(1),
	title: z.string().min(1).max(500),
	description: z.string(),
	status: TicketStatusSchema.default('backlog'),
	labels: z.array(z.string()).default([]),
	fields: z.record(z.string(), z.string()).default({}),
	parentId: z.string().optional(),
	flowId: z.string().optional(),
	/** Initial order value — defaults to 1000 * (sibling count + 1) if omitted */
	order: z.number().optional(),
});

export const UpdateTicketSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	description: z.string().optional(),
	status: TicketStatusSchema.optional(),
	labels: z.array(z.string()).optional(),
	fields: z.record(z.string(), z.string()).optional(),
	parentId: z.string().nullable().optional(),
	flowId: z.string().nullable().optional(),
	/** Optimistic locking: must match current version */
	version: z.number().int().positive(),
});

export const ReorderTicketSchema = z.object({
	/** New float order value */
	order: z.number(),
	/** Optimistic locking: must match current version */
	version: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Label autocomplete
// ---------------------------------------------------------------------------

export const LabelsQuerySchema = z.object({
	projectId: z.string().min(1),
	q: z.string().optional(),
});

export const LabelsResponseSchema = z.object({
	labels: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// AI analysis schemas
// ---------------------------------------------------------------------------

export const AnalyzeTicketSchema = z.object({
	description: z.string().min(1),
	projectId: z.string().min(1),
	/** Previous answers to clarification questions (for second-pass calls) */
	clarificationAnswers: z.record(z.string(), z.string()).optional(),
});

export const CreateWithAiTitleSchema = z.object({
	projectId: z.string(),
	description: z.string(),
});
export type CreateWithAiTitle = z.infer<typeof CreateWithAiTitleSchema>;

export const SubTicketPlanSchema = z.object({
	title: z.string(),
	description: z.string(),
	/** AI-generated YAML for this sub-ticket's implementation flow */
	flowYaml: z.string(),
});

export const TicketAnalysisPlanSchema = z.object({
	title: z.string(),
	labels: z.array(z.string()),
	fields: z.record(z.string(), z.string()),
	complexity: z.enum(['simple', 'medium', 'complex']),
	analysis: z.string(),
	subTickets: z.array(SubTicketPlanSchema),
	/** If true, frontend should show a clarification dialog before proceeding */
	needsClarification: z.boolean().optional(),
	/** Questions to ask the user before finalizing the plan */
	clarificationQuestions: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Create-from-plan schema
// ---------------------------------------------------------------------------

export const CreateFromPlanSchema = z.object({
	projectId: z.string().min(1),
	plan: TicketAnalysisPlanSchema,
	/** Original user description — used as parent ticket description instead of AI analysis */
	originalDescription: z.string().optional(),
});

export const CreateFromPlanResponseSchema = z.object({
	parentTicket: TicketSchema,
	subTickets: z.array(TicketSchema),
	/** Flow IDs that were created */
	createdFlowIds: z.array(z.string()),
	/** Sub-tickets that failed flow validation (created without a flow) */
	flowValidationWarnings: z.array(
		z.object({
			subTicketTitle: z.string(),
			errors: z.array(z.string()),
		})
	),
});

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type TicketStatus = z.infer<typeof TicketStatusSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type TicketsQuery = z.infer<typeof TicketsQuerySchema>;
export type TicketsListResponse = z.infer<typeof TicketsListResponseSchema>;
export type CreateTicket = z.infer<typeof CreateTicketSchema>;
export type UpdateTicket = z.infer<typeof UpdateTicketSchema>;
export type ReorderTicket = z.infer<typeof ReorderTicketSchema>;
export type LabelsQuery = z.infer<typeof LabelsQuerySchema>;
export type LabelsResponse = z.infer<typeof LabelsResponseSchema>;
export type AnalyzeTicket = z.infer<typeof AnalyzeTicketSchema>;
export type SubTicketPlan = z.infer<typeof SubTicketPlanSchema>;
export type TicketAnalysisPlan = z.infer<typeof TicketAnalysisPlanSchema>;
export type CreateFromPlan = z.infer<typeof CreateFromPlanSchema>;
export type CreateFromPlanResponse = z.infer<typeof CreateFromPlanResponseSchema>;
export type TicketHistoryEvent = z.infer<typeof TicketHistoryEventSchema>;
export type TicketHistoryResponse = z.infer<typeof TicketHistoryResponseSchema>;

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const TICKETS_API_ROUTES = defineRoutes({
	'/api/tickets/': {
		GET: {
			query: TicketsQuerySchema,
			response: TicketsListResponseSchema,
		},
		POST: {
			body: CreateTicketSchema,
			response: TicketSchema,
		},
	},
	'/api/tickets/labels': {
		GET: {
			query: LabelsQuerySchema,
			response: LabelsResponseSchema,
		},
	},
	'/api/tickets/analyze': {
		POST: {
			body: AnalyzeTicketSchema,
			response: TicketAnalysisPlanSchema,
		},
	},
	'/api/tickets/create-with-ai-title': {
		POST: {
			body: CreateWithAiTitleSchema,
			response: TicketSchema,
		},
	},
	'/api/tickets/create-from-plan': {
		POST: {
			body: CreateFromPlanSchema,
			response: CreateFromPlanResponseSchema,
		},
	},
	'/api/tickets/:id': {
		GET: {
			params: z.object({ id: z.string() }),
			response: TicketSchema,
		},
		PATCH: {
			params: z.object({ id: z.string() }),
			body: UpdateTicketSchema,
			response: TicketSchema,
		},
		DELETE: {
			params: z.object({ id: z.string() }),
			response: DeleteResponseSchema,
		},
	},
	'/api/tickets/:id/reorder': {
		PATCH: {
			params: z.object({ id: z.string() }),
			body: ReorderTicketSchema,
			response: TicketSchema,
		},
	},
	'/api/tickets/:ticketId/comments': {
		GET: {
			params: z.object({ ticketId: z.string() }),
			response: TicketCommentsResponseSchema,
		},
		POST: {
			params: z.object({ ticketId: z.string() }),
			body: CreateTicketCommentSchema,
			response: TicketCommentSchema,
		},
	},
	'/api/tickets/:ticketId/history': {
		GET: {
			params: z.object({ ticketId: z.string() }),
			response: TicketHistoryResponseSchema,
		},
	},
	'/api/tickets/:ticketId/feedback': {
		POST: {
			params: z.object({ ticketId: z.string() }),
			body: CreateFlowFeedbackSchema,
			response: FlowFeedbackSchema,
		},
	},
	'/api/tickets/:ticketId/retrospective': {
		POST: {
			params: z.object({ ticketId: z.string() }),
			body: CreateFlowRetrospectiveSchema,
			response: FlowRetrospectiveSchema,
		},
		GET: {
			params: z.object({ ticketId: z.string() }),
			response: FlowRetrospectiveSchema,
		},
	},
});
