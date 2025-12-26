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

export const FLOWS_API_ROUTES = defineRoutes({
	'/api/flows/': {
		GET: {
			response: FlowsByProjectSchema,
		},
	},
});
