/**
 * ===========================================================================================
 * BACKEND-TO-ORCHESTRATOR (B→O) CONTRACT
 * ===========================================================================================
 *
 * Type-safe request/response protocol for Backend → Orchestrator communication.
 * All request types are prefixed with B2O_ for clarity and discoverability.
 *
 * Methods supported:
 * - createTask: Create a new task
 * - getTask: Get task by ID
 * - getTasks: Get all tasks with optional filters
 * - getWorkers: Get all workers with optional filters
 * - getStats: Get orchestrator statistics
 * - updateConfig: Update orchestrator configuration
 * - renameWorker: Rename a worker
 *
 * ===========================================================================================
 */
import type { Task, WorkerInfo } from 'shared-common/types.js';
import { OrchestratorStats } from 'shared-common/types.js';
import { z } from 'zod';

// ===========================================================================================
// BASE REQUEST/RESPONSE TYPES
// ===========================================================================================

export interface B2ORequest {
	id: string;
	method: string;
	params?: unknown;
}

export interface B2OResponse {
	id: string;
	result?: unknown;
	error?: {
		code: string;
		message: string;
	};
}

// ===========================================================================================
// TASK OPERATIONS
// ===========================================================================================

/**
 * B2O_CreateTask: Create a new task
 */
export const B2O_CreateTaskRequestSchema = z.object({
	method: z.literal('createTask'),
	params: z.object({
		description: z.string(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	}),
});

export type B2O_CreateTaskRequest = z.infer<typeof B2O_CreateTaskRequestSchema>;

/**
 * B2O_GetTask: Get task by ID
 */
export const B2O_GetTaskRequestSchema = z.object({
	method: z.literal('getTask'),
	params: z.object({
		taskId: z.string(),
	}),
});

export type B2O_GetTaskRequest = z.infer<typeof B2O_GetTaskRequestSchema>;

/**
 * B2O_GetTasks: Get all tasks with optional filters
 */
export const B2O_GetTasksRequestSchema = z.object({
	method: z.literal('getTasks'),
	params: z
		.object({
			status: z.string().optional(),
			workerId: z.string().optional(),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
		})
		.optional(),
});

export type B2O_GetTasksRequest = z.infer<typeof B2O_GetTasksRequestSchema>;

// ===========================================================================================
// WORKER OPERATIONS
// ===========================================================================================

/**
 * B2O_GetWorkers: Get all workers with optional filters
 */
export const B2O_GetWorkersRequestSchema = z.object({
	method: z.literal('getWorkers'),
	params: z
		.object({
			type: z.string().optional(),
			status: z.enum(['idle', 'busy']).optional(),
		})
		.optional(),
});

export type B2O_GetWorkersRequest = z.infer<typeof B2O_GetWorkersRequestSchema>;

/**
 * B2O_RenameWorker: Rename a worker
 */
export const B2O_RenameWorkerRequestSchema = z.object({
	method: z.literal('renameWorker'),
	params: z.object({
		workerId: z.string(),
		name: z.string(),
	}),
});

export type B2O_RenameWorkerRequest = z.infer<typeof B2O_RenameWorkerRequestSchema>;

// ===========================================================================================
// ORCHESTRATOR OPERATIONS
// ===========================================================================================

/**
 * B2O_GetStats: Get orchestrator statistics
 */
export const B2O_GetStatsRequestSchema = z.object({
	method: z.literal('getStats'),
	params: z.object({}).optional(),
});

export type B2O_GetStatsRequest = z.infer<typeof B2O_GetStatsRequestSchema>;

/**
 * B2O_UpdateConfig: Update orchestrator configuration
 */
export const B2O_UpdateConfigRequestSchema = z.object({
	method: z.literal('updateConfig'),
	params: z.object({
		config: z.record(z.string(), z.unknown()),
	}),
});

export type B2O_UpdateConfigRequest = z.infer<typeof B2O_UpdateConfigRequestSchema>;

// ===========================================================================================
// TYPE-SAFE METHOD REGISTRY
// ===========================================================================================

/**
 * Type-safe mapping of method names to request/response types
 * This enables compile-time type checking for all B→O operations
 */
export interface B2OMethods {
	createTask: {
		request: B2O_CreateTaskRequest['params'];
		response: Task;
	};
	getTask: {
		request: B2O_GetTaskRequest['params'];
		response: Task | null;
	};
	getTasks: {
		request: B2O_GetTasksRequest['params'];
		response: Task[];
	};
	getWorkers: {
		request: B2O_GetWorkersRequest['params'];
		response: WorkerInfo[];
	};
	getStats: {
		request: B2O_GetStatsRequest['params'];
		response: OrchestratorStats;
	};
	updateConfig: {
		request: B2O_UpdateConfigRequest['params'];
		response: void;
	};
	renameWorker: {
		request: B2O_RenameWorkerRequest['params'];
		response: void;
	};
}

// ===========================================================================================
// VALIDATION HELPERS
// ===========================================================================================

/**
 * Map of all request schemas for validation
 */
export const B2O_REQUEST_SCHEMAS = {
	createTask: B2O_CreateTaskRequestSchema,
	getTask: B2O_GetTaskRequestSchema,
	getTasks: B2O_GetTasksRequestSchema,
	getWorkers: B2O_GetWorkersRequestSchema,
	getStats: B2O_GetStatsRequestSchema,
	updateConfig: B2O_UpdateConfigRequestSchema,
	renameWorker: B2O_RenameWorkerRequestSchema,
} as const;

/**
 * Validate a B2O request against its schema
 */
export function validateB2ORequest(method: string, request: unknown): boolean {
	const schema = B2O_REQUEST_SCHEMAS[method as keyof typeof B2O_REQUEST_SCHEMAS];
	if (!schema) {
		throw new Error(`Unknown B2O method: ${method}`);
	}
	schema.parse(request);
	return true;
}
