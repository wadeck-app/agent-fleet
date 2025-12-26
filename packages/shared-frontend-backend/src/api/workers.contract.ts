import { z } from 'zod';

import { defineRoutes } from '../route-builder';
import { WorkerFlowsSchema } from './flows.contract';

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
 * Extended query parameters with pagination, sorting, and search support
 */
export const WorkersListQuerySchema = z.object({
	// Pagination
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce.number().int().positive().max(100).optional(),
	// Sorting
	sortBy: z.string().optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	// Search
	search: z.string().optional(),
});

/**
 * Paginated workers list response
 */
export const WorkersListResponseSchema = z.object({
	items: z.array(WorkerSchema),
	pagination: z
		.object({
			total: z.number(),
			page: z.number(),
			pageSize: z.number(),
			totalPages: z.number(),
		})
		.optional(),
});

export type WorkersListQuery = z.infer<typeof WorkersListQuerySchema>;
export type WorkersListResponse = z.infer<typeof WorkersListResponseSchema>;

/**
 * Workers API routes
 */
export const WORKERS_API_ROUTES = defineRoutes({
	'/api/workers/': {
		GET: {
			query: WorkersListQuerySchema.optional(),
			response: z.union([WorkersDataSchema, WorkersListResponseSchema]),
		},
	},
	'/api/workers/:workerId/flows': {
		GET: {
			params: z.object({ workerId: z.string() }),
			response: WorkerFlowsSchema,
		},
	},
});

export type WorkersApiRoutes = typeof WORKERS_API_ROUTES;
