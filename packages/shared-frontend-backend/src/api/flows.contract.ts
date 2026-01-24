import { z } from 'zod';

import { defineRoutes } from '../route-builder';

// Validation issue schema for flow validation errors and warnings
export const ValidationIssueSchema = z.object({
	severity: z.enum(['error', 'warning', 'info']),
	code: z.string(),
	message: z.string(),
	location: z
		.object({
			stepId: z.string().optional(),
			field: z.string().optional(),
			path: z.string().optional(),
		})
		.optional(),
	suggestion: z.string().optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// Normalized input definition schema (matches NormalizedInputDefinition from flow-engine)
export const NormalizedInputDefinitionSchema = z.object({
	type: z.enum([
		// Base types
		'string',
		'number',
		'boolean',
		'object',
		// Text types
		'text',
		'url',
		'markdown',
		// Number types
		'integer',
		'percentage',
		'duration',
		// Selection types
		'enum',
		'multi-enum',
		// File types
		'file',
		'folder',
		// Date types
		'date',
		'datetime',
		// Code types
		'regex',
		// Structure types
		'array',
		'keyvalue',
		// Security types
		'password',
		// Business types
		'priority',
	]),
	required: z.boolean(),
	default: z.any().optional(),
	description: z.string().optional(),
	// Type-specific options and constraints
	options: z.any().optional(),
	source: z.enum(['explicit', 'auto-discovered']),
});

export type NormalizedInputDefinition = z.infer<typeof NormalizedInputDefinitionSchema>;

export const FlowMetadataSchema = z.object({
	id: z.string(),
	version: z.string(),
	hash: z.string(),
	name: z.string(),
	description: z.string(),
	inputs: z.record(z.string(), NormalizedInputDefinitionSchema),
	isValid: z.boolean(),
	validationErrors: z.array(ValidationIssueSchema).optional(),
	validationWarnings: z.array(ValidationIssueSchema).optional(),
});

export type FlowMetadata = z.infer<typeof FlowMetadataSchema>;

export const FlowsByProjectSchema = z.record(
	z.string(), // projectId
	z.record(z.string(), FlowMetadataSchema) // flowId -> metadata
);

export type FlowsByProject = z.infer<typeof FlowsByProjectSchema>;

export const WorkerFlowsSchema = z.array(FlowMetadataSchema);
export type WorkerFlows = z.infer<typeof WorkerFlowsSchema>;

// Full flow definition (simplified schema for now)
export const FlowDefinitionSchema = z.object({
	id: z.string(),
	version: z.string(),
	name: z.string(),
	description: z.string(),
	workspace: z.any().optional(), // Use z.any() for flexible object structure
	statusTransitions: z.any().optional(), // Use z.any() for flexible object structure
	inputs: z.record(z.string(), z.string()).optional(),
	steps: z.array(z.any()),
});

export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;

export const FlowListItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	version: z.string(),
});

export type FlowListItem = z.infer<typeof FlowListItemSchema>;

export const FlowIdParamSchema = z.object({
	flowId: z.string(),
});

export const FLOWS_API_ROUTES = defineRoutes({
	'/api/flows/': {
		GET: {
			response: FlowsByProjectSchema,
		},
	},
	'/api/flows/list': {
		GET: {
			response: z.array(FlowListItemSchema),
		},
	},
	'/api/flows/:flowId': {
		GET: {
			params: FlowIdParamSchema,
			response: FlowDefinitionSchema,
		},
		PUT: {
			params: FlowIdParamSchema,
			body: FlowDefinitionSchema,
			response: z.object({ success: z.boolean() }),
		},
	},
});
