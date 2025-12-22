import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * Task status enum - imported from shared-common but defined here for frontend use
 * Must match TaskStatus enum from shared-common package
 */
export const TaskStatusSchema = z.enum([
	'backlog',
	'refining',
	'refined',
	'prioritizing',
	'todo',
	'in_progress',
	'testing',
	'review',
	'reviewing',
	'changes_requested',
	'approved',
	'merged',
	'blocked',
	'cancelled',
]);

/**
 * Task priority enum
 */
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

/**
 * Individual task schema
 */
export const TaskSchema = z.object({
	id: z.string(),
	description: z.string(),
	status: TaskStatusSchema,
	priority: TaskPrioritySchema,
	createdAt: z.string(), // ISO 8601
	updatedAt: z.string(), // ISO 8601
	assignedWorker: z
		.object({
			workerId: z.string(),
			workerType: z.string(),
		})
		.nullable(),
	// Flow-related fields
	flowId: z.string().optional(),
	flowResult: z
		.object({
			status: z.enum(['completed', 'failed']),
			error: z.string().optional(),
		})
		.optional(),
});

/**
 * Query parameters for filtering tasks
 */
export const TasksQuerySchema = z.object({
	status: TaskStatusSchema.optional(),
	workerId: z.string().optional(),
	priority: TaskPrioritySchema.optional(),
});

/**
 * Tasks list response with summary stats
 */
export const TasksDataSchema = z.object({
	timestamp: z.string(),
	summary: z.object({
		total: z.number(),
		byStatus: z.record(z.string(), z.number()),
		byPriority: z.record(z.string(), z.number()),
	}),
	tasks: z.array(TaskSchema),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TasksQuery = z.infer<typeof TasksQuerySchema>;
export type TasksData = z.infer<typeof TasksDataSchema>;

/**
 * Create task request schema
 */
export const CreateTaskSchema = z.object({
	description: z.string(),
	status: TaskStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

/**
 * Tasks API routes
 */
export const TASKS_API_ROUTES = defineRoutes({
	'/api/tasks/': {
		GET: {
			query: TasksQuerySchema,
			response: TasksDataSchema,
		},
		POST: {
			body: CreateTaskSchema,
			response: TaskSchema,
		},
	},
	'/api/tasks/:id': {
		GET: {
			params: z.object({ id: z.string() }),
			response: TaskSchema,
		},
	},
});

export type TasksApiRoutes = typeof TASKS_API_ROUTES;
