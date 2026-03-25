import { z } from 'zod';

import { defineRoutes } from '../route-builder';

// ---------------------------------------------------------------------------
// Flow feedback schemas
// ---------------------------------------------------------------------------

export const FlowFeedbackSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	rating: z.number().int().min(1).max(5),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()).optional(),
	submittedAt: z.string(),
	author: z.string(),
});

export const CreateFlowFeedbackSchema = FlowFeedbackSchema.omit({ id: true, submittedAt: true });

export const UpdateFlowFeedbackSchema = z.object({
	rating: z.number().int().min(1).max(5).optional(),
	wentWell: z.array(z.string()).optional(),
	wentWrong: z.array(z.string()).optional(),
	suggestions: z.array(z.string()).optional(),
});

export type FlowFeedback = z.infer<typeof FlowFeedbackSchema>;
export type CreateFlowFeedback = z.infer<typeof CreateFlowFeedbackSchema>;
export type UpdateFlowFeedback = z.infer<typeof UpdateFlowFeedbackSchema>;

// ---------------------------------------------------------------------------
// Flow retrospective schemas
// ---------------------------------------------------------------------------

export const FlowRetrospectiveSchema = z.object({
	id: z.string(),
	ticketId: z.string(),
	flowId: z.string(),
	taskId: z.string(),
	wentWell: z.array(z.string()),
	wentWrong: z.array(z.string()),
	suggestions: z.array(z.string()),
	executionSummary: z.string(),
	generatedAt: z.string(),
});

export const CreateFlowRetrospectiveSchema = FlowRetrospectiveSchema.omit({ id: true, generatedAt: true });

export type FlowRetrospective = z.infer<typeof FlowRetrospectiveSchema>;
export type CreateFlowRetrospective = z.infer<typeof CreateFlowRetrospectiveSchema>;

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const FLOW_FEEDBACK_API_ROUTES = defineRoutes({
	'/api/tickets/:ticketId/feedback': {
		POST: {
			params: z.object({ ticketId: z.string() }),
			body: CreateFlowFeedbackSchema,
			response: FlowFeedbackSchema,
		},
	},
	'/api/flows/:flowId/feedback': {
		GET: {
			params: z.object({ flowId: z.string() }),
			response: z.object({ items: z.array(FlowFeedbackSchema) }),
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

export type FlowFeedbackApiRoutes = typeof FLOW_FEEDBACK_API_ROUTES;

// ---------------------------------------------------------------------------
// Management routes (update/delete) — separate contract so __baseUrl stays
// '/api/flow-feedback' and does not collide with /api/tickets
// ---------------------------------------------------------------------------

export const FLOW_FEEDBACK_MANAGEMENT_ROUTES = defineRoutes({
	'/api/flow-feedback/:feedbackId': {
		PUT: {
			params: z.object({ feedbackId: z.string() }),
			body: UpdateFlowFeedbackSchema,
			response: FlowFeedbackSchema,
		},
		DELETE: {
			params: z.object({ feedbackId: z.string() }),
			response: z.object({}),
		},
	},
});

export type FlowFeedbackManagementRoutes = typeof FLOW_FEEDBACK_MANAGEMENT_ROUTES;
