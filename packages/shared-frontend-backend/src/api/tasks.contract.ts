import { z } from 'zod';

import {
	type BulkDeleteRequest,
	BulkDeleteRequestSchema,
	type BulkDeleteResponse,
	BulkDeleteResponseSchema,
	type FailedDeletion,
} from '../common/api-helpers';
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
	'awaiting_user',
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
/**
 * Log level enum
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warning', 'error']);

/**
 * Individual log entry (from FlowTrace step)
 */
export const LogEntrySchema = z.object({
	/** Unique log entry ID (stepId + sequence) */
	id: z.string(),
	/** Timestamp (Unix ms) */
	timestamp: z.number(),
	/** Log level */
	level: LogLevelSchema,
	/** Log message */
	message: z.string(),
	/** Step ID this log belongs to */
	stepId: z.string(),
	/** Step name */
	stepName: z.string(),
	/** Step type */
	stepType: z.enum(['model', 'script', 'subflow', 'constant']),
	/** Optional metadata (prompt, response, stdout, stderr, etc.) */
	metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Task schema with full flowResult including trace
 */
export const TaskSchema = z.object({
	id: z.string(),
	description: z.string(),
	status: TaskStatusSchema,
	priority: TaskPrioritySchema,
	version: z.number().int().positive(), // Optimistic locking
	createdAt: z.string(), // ISO 8601
	updatedAt: z.string(), // ISO 8601
	assignedWorker: z
		.object({
			workerId: z.string(),
			// workerType: z.string(),
		})
		.nullable(),
	// Flow-related fields
	flowId: z.string().optional(),
	flowInputs: z.record(z.string(), z.any()).optional(),
	flowResult: z
		.object({
			status: z.enum(['completed', 'failed']),
			error: z.string().optional(),
			outputs: z.record(z.string(), z.any()).optional(),
			trace: z.any().optional(), // Full FlowTrace object
		})
		.optional(),
	// Project and workspace assignment
	projectId: z.string().optional(),
	workspaceId: z.string().optional(),
});

/**
 * Query parameters for filtering tasks
 */
export const TasksQuerySchema = z.object({
	status: TaskStatusSchema.optional(),
	workerId: z.string().optional(),
	priority: TaskPrioritySchema.optional(),
	flowId: z.string().optional(),
	projectId: z.string().optional(),
	workspaceId: z.string().optional(),
});

/**
 * Extended query parameters with pagination, sorting, and search support
 */
export const TasksListQuerySchema = z.object({
	// Pagination
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce.number().int().positive().max(100).optional(),
	// Sorting
	sortBy: z.string().optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	// Search
	search: z.string().optional(),
	// Existing filters
	status: TaskStatusSchema.optional(),
	workerId: z.string().optional(),
	priority: TaskPrioritySchema.optional(),
	flowId: z.string().optional(),
	projectId: z.string().optional(),
	workspaceId: z.string().optional(),
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

/**
 * Paginated tasks list response
 */
export const TasksListResponseSchema = z.object({
	items: z.array(TaskSchema),
	pagination: z
		.object({
			total: z.number(),
			page: z.number(),
			pageSize: z.number(),
			totalPages: z.number(),
		})
		.optional(),
});

/**
 * Paginated logs query parameters
 */
export const PaginatedLogsQuerySchema = z.object({
	/** Cursor for pagination (step index) */
	cursor: z.coerce.number().int().min(0).optional(),
	/** Page size (max 500 for large logs) */
	limit: z.coerce.number().int().positive().max(500).default(100),
	/** Filter by log level */
	level: LogLevelSchema.optional(),
	/** Search query (matches message content) */
	search: z.string().optional(),
});

/**
 * Paginated logs response
 */
export const PaginatedLogsResponseSchema = z.object({
	/** Log entries */
	logs: z.array(LogEntrySchema),
	/** Next cursor for pagination (null if no more logs) */
	nextCursor: z.number().nullable(),
	/** Total count of logs (for UI display) */
	total: z.number(),
	/** Whether the task is still running (for real-time updates) */
	isRunning: z.boolean(),
});

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type PaginatedLogsQuery = z.infer<typeof PaginatedLogsQuerySchema>;
export type PaginatedLogsResponse = z.infer<typeof PaginatedLogsResponseSchema>;

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TasksQuery = z.infer<typeof TasksQuerySchema>;
export type TasksData = z.infer<typeof TasksDataSchema>;
export type TasksListQuery = z.infer<typeof TasksListQuerySchema>;
export type TasksListResponse = z.infer<typeof TasksListResponseSchema>;

/**
 * Create task request schema
 */
export const CreateTaskSchema = z.object({
	description: z.string().min(1, 'Description is required'),
	priority: TaskPrioritySchema,
	assignedTo: z.object({
		workerId: z.string(),
	}),
	flowId: z.string().optional(),
	flowInputs: z.record(z.string(), z.any()).optional(),
	projectId: z.string().optional(),
	workspaceId: z.string().optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

/**
 * Update task status request schema
 */
export const UpdateTaskStatusSchema = z.object({
	status: TaskStatusSchema,
});

export type UpdateTaskStatus = z.infer<typeof UpdateTaskStatusSchema>;

/**
 * Tasks API routes
 */
export const TASKS_API_ROUTES = defineRoutes({
	'/api/tasks/': {
		GET: {
			query: TasksListQuerySchema,
			response: z.union([TasksDataSchema, TasksListResponseSchema]),
		},
		POST: {
			body: CreateTaskSchema,
			response: TaskSchema,
		},
		DELETE: {
			body: BulkDeleteRequestSchema,
			response: BulkDeleteResponseSchema,
		},
	},
	'/api/tasks/:id': {
		GET: {
			params: z.object({ id: z.string() }),
			response: TaskSchema,
		},
		DELETE: {
			params: z.object({ id: z.string() }),
			response: z.object({ success: z.boolean() }),
		},
		PATCH: {
			params: z.object({ id: z.string() }),
			body: UpdateTaskStatusSchema,
			response: TaskSchema,
		},
	},
	'/api/tasks/:id/logs': {
		GET: {
			params: z.object({ id: z.string() }),
			query: PaginatedLogsQuerySchema,
			response: PaginatedLogsResponseSchema,
		},
	},
});

export type TasksApiRoutes = typeof TASKS_API_ROUTES;
