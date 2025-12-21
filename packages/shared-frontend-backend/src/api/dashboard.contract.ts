import { z } from 'zod';
import { defineRoutes } from '../route-builder.js';

/**
 * Orchestrator status enum
 */
export const OrchestratorStatusSchema = z.enum(['ready', 'starting', 'stopping', 'offline']);

/**
 * Activity type enum for recent activity feed
 */
export const ActivityTypeSchema = z.enum([
	'task_completed',
	'task_started',
	'task_review',
	'task_merged',
	'task_failed',
	'worker_connected',
	'worker_disconnected',
]);

/**
 * Recent activity entry schema
 */
export const ActivityEntrySchema = z.object({
	timestamp: z.string(), // ISO 8601
	type: ActivityTypeSchema,
	message: z.string(),
	taskId: z.string().optional(),
	workerId: z.string().optional(),
});

/**
 * Dashboard data schema - simplified DTO for frontend consumption
 * This is a transformed version of the orchestrator stats, optimized for dashboard display
 */
export const DashboardDataSchema = z.object({
	timestamp: z.string(),
	orchestrator: z.object({
		status: OrchestratorStatusSchema,
		uptime: z.number(), // milliseconds
		version: z.string(),
	}),
	workers: z.object({
		connected: z.number(),
		idle: z.number(),
		busy: z.number(),
	}),
	tasks: z.object({
		total: z.number(),
		active: z.number(), // IN_PROGRESS + TESTING
		review: z.number(), // REVIEW
		done: z.number(), // APPROVED + MERGED
		blocked: z.number(), // BLOCKED
		failed: z.number(), // CANCELLED
	}),
	throughput: z.object({
		tasksPerHour: z.number(),
		successRate: z.number(), // 0-100 percentage
		avgTaskDuration: z.number(), // milliseconds
	}),
	recentActivity: z.array(ActivityEntrySchema).max(10), // Last 10 activities
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;
export type OrchestratorStatus = z.infer<typeof OrchestratorStatusSchema>;
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

/**
 * Dashboard API routes
 */
export const DASHBOARD_API_ROUTES = defineRoutes({
  '/api/dashboard/': {
    GET: {
      response: DashboardDataSchema,
    },
  },
});

export type DashboardApiRoutes = typeof DASHBOARD_API_ROUTES;
