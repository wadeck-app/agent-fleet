import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * Intervention type enum
 */
export const InterventionTypeSchema = z.enum(['approval', 'question', 'choice']);

/**
 * Intervention status enum
 */
export const InterventionStatusSchema = z.enum(['pending', 'answered', 'timeout', 'cancelled']);

/**
 * Intervention source type enum
 */
export const InterventionSourceTypeSchema = z.enum(['flow_step', 'agent_tool']);

/**
 * Intervention option schema (for choice type)
 */
export const InterventionOptionSchema = z.object({
	id: z.string(),
	label: z.string(),
	description: z.string().optional(),
});

/**
 * Intervention validation schema (for question type)
 */
export const InterventionValidationSchema = z.object({
	pattern: z.string().optional(),
	min: z.number().optional(),
	max: z.number().optional(),
});

/**
 * Intervention configuration schema
 */
export const InterventionConfigSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	// For approval
	allowReject: z.boolean().optional(),
	// For question
	question: z.string().optional(),
	responseType: z.enum(['text', 'number', 'boolean']).optional(),
	validation: InterventionValidationSchema.optional(),
	// For choice
	options: z.array(InterventionOptionSchema).optional(),
	allowMultiple: z.boolean().optional(),
});

/**
 * Intervention source schema
 */
export const InterventionSourceSchema = z.object({
	type: InterventionSourceTypeSchema,
	stepId: z.string().optional(),
	toolName: z.string().optional(),
});

/**
 * Intervention timeout schema
 */
export const InterventionTimeoutSchema = z.object({
	minutes: z.number(),
	onTimeout: z.enum(['fail', 'continue', 'default']),
	defaultValue: z.any().optional(),
});

/**
 * Intervention response schema
 */
export const InterventionResponseSchema = z.object({
	value: z.any(),
	answeredBy: z.string(),
	comment: z.string().optional(),
});

/**
 * Individual intervention schema
 */
export const InterventionSchema = z.object({
	id: z.string(),
	taskId: z.string(),
	workerId: z.string().optional(),
	flowId: z.string().optional(),
	stepId: z.string().optional(),
	type: InterventionTypeSchema,
	status: InterventionStatusSchema,
	createdAt: z.string(), // ISO 8601
	answeredAt: z.string().optional(),
	timeoutAt: z.string().optional(),
	source: InterventionSourceSchema,
	config: InterventionConfigSchema,
	blocking: z.boolean(),
	timeout: InterventionTimeoutSchema.optional(),
	response: InterventionResponseSchema.optional(),
});

/**
 * Query parameters for filtering interventions
 */
export const InterventionsQuerySchema = z.object({
	status: InterventionStatusSchema.optional(),
	type: InterventionTypeSchema.optional(),
	taskId: z.string().optional(),
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Pagination metadata schema
 */
export const PaginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
	totalPages: z.number(),
});

/**
 * Interventions list response
 */
export const InterventionsListResponseSchema = z.object({
	items: z.array(InterventionSchema),
	pagination: PaginationSchema.optional(),
});

/**
 * Response submission schema
 */
export const InterventionResponseSubmitSchema = z.object({
	value: z.any(),
	comment: z.string().optional(),
});

/**
 * Generic success response
 */
export const SuccessResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
});

/**
 * API Routes definition using zod schemas
 */
export const INTERVENTIONS_API_ROUTES = defineRoutes({
	'/api/interventions/': {
		GET: {
			query: InterventionsQuerySchema,
			response: InterventionsListResponseSchema,
		},
	},
	'/api/interventions/:interventionId': {
		GET: {
			params: z.object({ interventionId: z.string() }),
			response: InterventionSchema,
		},
	},
	'/api/interventions/:interventionId/respond': {
		POST: {
			params: z.object({ interventionId: z.string() }),
			body: InterventionResponseSubmitSchema,
			response: SuccessResponseSchema,
		},
	},
	'/api/interventions/:interventionId/cancel': {
		POST: {
			params: z.object({ interventionId: z.string() }),
			response: SuccessResponseSchema,
		},
	},
});

// Type exports
export type InterventionType = z.infer<typeof InterventionTypeSchema>;
export type InterventionStatus = z.infer<typeof InterventionStatusSchema>;
export type Intervention = z.infer<typeof InterventionSchema>;
export type InterventionsQuery = z.infer<typeof InterventionsQuerySchema>;
export type InterventionsListResponse = z.infer<typeof InterventionsListResponseSchema>;
export type InterventionResponseSubmit = z.infer<typeof InterventionResponseSubmitSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
