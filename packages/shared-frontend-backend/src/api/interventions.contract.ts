import { z } from 'zod';

import { createListResponseSchema, createQuerySchema } from '../common/api-helpers';
import { BaseEntitySchema, IdParamSchema } from '../common/base-entity';
import { defineRoutes } from '../route-builder';
import { assertValidRoutes } from '../utils/validate-routes';
import { optionalSanitizedString, sanitizedString } from '../validation/sanitization';

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
 * All string inputs are sanitized to prevent XSS
 */
export const InterventionOptionSchema = z.object({
	id: sanitizedString(1, 100),
	label: sanitizedString(1, 255),
	description: optionalSanitizedString(500),
});

/**
 * Intervention validation schema (for question type)
 */
export const InterventionValidationSchema = z.object({
	pattern: optionalSanitizedString(500),
	min: z.number().optional(),
	max: z.number().optional(),
});

/**
 * Intervention configuration schema
 * All string inputs are sanitized to prevent XSS
 */
export const InterventionConfigSchema = z.object({
	title: sanitizedString(1, 255),
	description: optionalSanitizedString(1000),
	// For approval
	allowReject: z.boolean().optional(),
	// For question
	question: optionalSanitizedString(1000),
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
	stepId: optionalSanitizedString(100),
	toolName: optionalSanitizedString(100),
});

/**
 * Intervention timeout schema
 */
export const InterventionTimeoutSchema = z.object({
	minutes: z.number().positive(),
	onTimeout: z.enum(['fail', 'continue', 'default']),
	defaultValue: z.any().optional(),
});

/**
 * Intervention response schema
 * All string inputs are sanitized to prevent XSS
 */
export const InterventionResponseSchema = z.object({
	value: z.any(),
	answeredBy: sanitizedString(1, 255),
	comment: optionalSanitizedString(1000),
});

/**
 * Intervention-specific fields
 */
const InterventionFields = z.object({
	taskId: sanitizedString(1, 100),
	workerId: optionalSanitizedString(100),
	flowId: optionalSanitizedString(100),
	stepId: optionalSanitizedString(100),
	type: InterventionTypeSchema,
	status: InterventionStatusSchema,
	answeredAt: z.string().optional(), // ISO 8601
	timeoutAt: z.string().optional(), // ISO 8601
	source: InterventionSourceSchema,
	config: InterventionConfigSchema,
	blocking: z.boolean(),
	timeout: InterventionTimeoutSchema.optional(),
	response: InterventionResponseSchema.optional(),
});

/**
 * Complete intervention = specific fields + common metadata (id, createdAt, updatedAt, version)
 */
export const InterventionSchema = InterventionFields.merge(BaseEntitySchema);

/**
 * Query parameters for filtering interventions (extends common base with pagination/sorting)
 */
export const InterventionsQuerySchema = createQuerySchema({
	status: InterventionStatusSchema.optional(),
	type: InterventionTypeSchema.optional(),
	taskId: optionalSanitizedString(100),
	blocking: z.boolean().optional(),
});

/**
 * Interventions list response (uses common pagination structure)
 */
export const InterventionsListResponseSchema = createListResponseSchema(InterventionSchema);

/**
 * Response submission schema
 * All string inputs are sanitized to prevent XSS
 */
export const InterventionResponseSubmitSchema = z.object({
	value: z.any(),
	comment: optionalSanitizedString(1000),
});

/**
 * Generic success response
 */
export const SuccessResponseSchema = z.object({
	success: z.boolean(),
	message: optionalSanitizedString(500),
});

/**
 * Bulk cancel request schema
 */
export const BulkCancelRequestSchema = z.object({
	ids: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Bulk cancel response schema
 */
export const BulkCancelResponseSchema = z.object({
	cancelled: z.array(z.string()),
	failed: z.array(
		z.object({
			id: z.string(),
			error: z.string(),
		})
	),
});

/**
 * API Routes definition using zod schemas
 * Following the same pattern as ingredients (using :id instead of :interventionId)
 */
export const INTERVENTIONS_API_ROUTES = defineRoutes({
	'/api/interventions/': {
		GET: {
			query: InterventionsQuerySchema,
			response: InterventionsListResponseSchema,
		},
	},
	'/api/interventions/:id': {
		GET: {
			params: IdParamSchema,
			response: InterventionSchema,
		},
	},
	'/api/interventions/:id/respond': {
		POST: {
			params: IdParamSchema,
			body: InterventionResponseSubmitSchema,
			response: SuccessResponseSchema,
		},
	},
	'/api/interventions/:id/cancel': {
		POST: {
			params: IdParamSchema,
			response: SuccessResponseSchema,
		},
	},
	'/api/interventions/bulk-cancel/': {
		POST: {
			body: BulkCancelRequestSchema,
			response: BulkCancelResponseSchema,
		},
	},
});

// Validate routes at module load time (development/test only)
if (process.env.NODE_ENV !== 'production') {
	assertValidRoutes(INTERVENTIONS_API_ROUTES, 'INTERVENTIONS_API');
}

// Type exports
export type InterventionType = z.infer<typeof InterventionTypeSchema>;
export type InterventionStatus = z.infer<typeof InterventionStatusSchema>;
export type Intervention = z.infer<typeof InterventionSchema>;
export type InterventionsQuery = z.infer<typeof InterventionsQuerySchema>;
export type InterventionsListResponse = z.infer<typeof InterventionsListResponseSchema>;
export type InterventionResponseSubmit = z.infer<typeof InterventionResponseSubmitSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export type BulkCancelRequest = z.infer<typeof BulkCancelRequestSchema>;
export type BulkCancelResponse = z.infer<typeof BulkCancelResponseSchema>;
