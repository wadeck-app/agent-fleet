import { z } from 'zod';

import { defineRoutes } from '../route-builder';

export const FlowMetadataSchema = z.object({
	id: z.string(),
	version: z.string(),
	hash: z.string(),
	name: z.string(),
	description: z.string(),
	inputs: z.record(z.string(), z.enum(['string', 'number', 'boolean', 'object'])).optional(),
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
	workspace: z.record(z.any()).optional(),
	statusTransitions: z.record(z.any()).optional(),
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
