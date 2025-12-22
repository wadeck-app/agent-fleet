import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * Worker connection status
 */
export const WorkerConnectionStatusSchema = z.enum(['connected', 'disconnected']);

/**
 * Worker state based on task assignment
 */
export const WorkerStateSchema = z.enum(['idle', 'busy']);

/**
 * Individual worker schema
 */
export const WorkerSchema = z.object({
	workerId: z.string(),
	type: z.string(),
	connected: z.boolean(),
	taskId: z.string().optional(),
	state: WorkerStateSchema,
	// Extended fields (would come from tracking)
	uptime: z.number().optional(), // milliseconds
	lastHeartbeat: z.string().optional(), // ISO timestamp
	tasksCompleted: z.number().optional(),
	successRate: z.number().optional(), // 0-100 percentage
});

/**
 * Workers list response with summary stats
 */
export const WorkersDataSchema = z.object({
	timestamp: z.string(),
	summary: z.object({
		total: z.number(),
		connected: z.number(),
		disconnected: z.number(),
		idle: z.number(),
		busy: z.number(),
		avgLoad: z.number(), // 0-100 percentage
	}),
	workers: z.array(WorkerSchema),
});

export type WorkerConnectionStatus = z.infer<typeof WorkerConnectionStatusSchema>;
export type WorkerState = z.infer<typeof WorkerStateSchema>;
export type Worker = z.infer<typeof WorkerSchema>;
export type WorkersData = z.infer<typeof WorkersDataSchema>;

/**
 * Workers API routes
 */
export const WORKERS_API_ROUTES = defineRoutes({
	'/api/workers/': {
		GET: {
			response: WorkersDataSchema,
		},
	},
});

export type WorkersApiRoutes = typeof WORKERS_API_ROUTES;
