import { z } from 'zod';

import { BaseEntitySchema, IdParamSchema } from '../common/base-entity';
import { defineRoutes } from '../route-builder';

/**
 * Script process status enum
 */
export const ScriptProcessStatusSchema = z.enum(['stopped', 'starting', 'running', 'stopping', 'error', 'crashed']);

/**
 * WorkspaceScript schema - Configuration for a script that can be run in a workspace
 */
export const WorkspaceScriptSchema = BaseEntitySchema.extend({
	workspaceId: z.string(),
	scriptName: z.string(), // ex: "dev:backend"
	enabled: z.boolean(),
	displayName: z.string().optional(),
	description: z.string().optional(),
	url: z.string().url().optional(), // ex: "http://localhost:3000"
	order: z.number().int().min(0),
	autoStart: z.boolean(), // Auto-start on workspace open
	restartOnFailure: z.boolean(), // Auto-restart crashed scripts
});

/**
 * ScriptProcess schema - Runtime state of a running script
 */
export const ScriptProcessSchema = z.object({
	id: z.string(),
	workspaceScriptId: z.string(),
	pid: z.number().int().positive().optional(),
	status: ScriptProcessStatusSchema,
	startedAt: z.string().datetime().optional(),
	stoppedAt: z.string().datetime().optional(),
	exitCode: z.number().int().optional(),
	error: z.string().optional(),
	restartCount: z.number().int().min(0),
	lastHeartbeat: z.string().datetime().optional(),
});

/**
 * Available script from package.json
 */
export const AvailableScriptSchema = z.object({
	name: z.string(),
	command: z.string(),
});

/**
 * Log entry for script output
 */
export const ScriptLogEntrySchema = z.object({
	id: z.string(),
	timestamp: z.number(), // Unix milliseconds
	level: z.enum(['stdout', 'stderr', 'info', 'error']),
	message: z.string(),
});

/**
 * Paginated script logs query parameters
 */
export const PaginatedScriptLogsQuerySchema = z.object({
	cursor: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().positive().max(500).default(100),
	level: z.enum(['stdout', 'stderr', 'info', 'error']).optional(),
	search: z.string().optional(),
});

/**
 * Paginated script logs response
 */
export const PaginatedScriptLogsResponseSchema = z.object({
	logs: z.array(ScriptLogEntrySchema),
	nextCursor: z.number().nullable(),
	total: z.number(),
	isRunning: z.boolean(),
});

/**
 * Create workspace script request
 */
export const CreateWorkspaceScriptSchema = z.object({
	scriptName: z.string().min(1),
	enabled: z.boolean().default(true),
	displayName: z.string().optional(),
	description: z.string().optional(),
	url: z.string().url().optional(),
	order: z.number().int().min(0).default(0),
	autoStart: z.boolean().default(false),
	restartOnFailure: z.boolean().default(false),
});

/**
 * Update workspace script request
 */
export const UpdateWorkspaceScriptSchema = z.object({
	scriptName: z.string().min(1).optional(),
	enabled: z.boolean().optional(),
	displayName: z.string().optional(),
	description: z.string().optional(),
	url: z.string().url().optional(),
	order: z.number().int().min(0).optional(),
	autoStart: z.boolean().optional(),
	restartOnFailure: z.boolean().optional(),
	version: z.number().int().positive(), // Optimistic locking
});

/**
 * Script process with script config (combined view)
 */
export const ScriptProcessWithConfigSchema = z.object({
	script: WorkspaceScriptSchema,
	process: ScriptProcessSchema.optional(),
});

/**
 * Type exports
 */
export type ScriptProcessStatus = z.infer<typeof ScriptProcessStatusSchema>;
export type WorkspaceScript = z.infer<typeof WorkspaceScriptSchema>;
export type ScriptProcess = z.infer<typeof ScriptProcessSchema>;
export type AvailableScript = z.infer<typeof AvailableScriptSchema>;
export type ScriptLogEntry = z.infer<typeof ScriptLogEntrySchema>;
export type PaginatedScriptLogsQuery = z.infer<typeof PaginatedScriptLogsQuerySchema>;
export type PaginatedScriptLogsResponse = z.infer<typeof PaginatedScriptLogsResponseSchema>;
export type CreateWorkspaceScript = z.infer<typeof CreateWorkspaceScriptSchema>;
export type UpdateWorkspaceScript = z.infer<typeof UpdateWorkspaceScriptSchema>;
export type ScriptProcessWithConfig = z.infer<typeof ScriptProcessWithConfigSchema>;

/**
 * Workspace Scripts API routes
 */
export const WORKSPACE_SCRIPTS_API_ROUTES = defineRoutes({
	'/api/workspaces/:workspaceId/scripts/': {
		GET: {
			params: z.object({ workspaceId: z.string() }),
			response: z.array(ScriptProcessWithConfigSchema),
		},
		POST: {
			params: z.object({ workspaceId: z.string() }),
			body: CreateWorkspaceScriptSchema,
			response: WorkspaceScriptSchema,
		},
	},
	'/api/workspaces/:workspaceId/scripts/available': {
		GET: {
			params: z.object({ workspaceId: z.string() }),
			response: z.array(AvailableScriptSchema),
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id': {
		GET: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: ScriptProcessWithConfigSchema,
		},
		PATCH: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			body: UpdateWorkspaceScriptSchema,
			response: WorkspaceScriptSchema,
		},
		DELETE: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: z.object({ success: z.boolean() }),
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/start': {
		POST: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: ScriptProcessSchema,
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/stop': {
		POST: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: ScriptProcessSchema,
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/restart': {
		POST: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: ScriptProcessSchema,
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/logs': {
		GET: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			query: PaginatedScriptLogsQuerySchema,
			response: PaginatedScriptLogsResponseSchema,
		},
		DELETE: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: z.object({ success: z.boolean() }),
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/status': {
		GET: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: ScriptProcessSchema,
		},
	},
	'/api/workspaces/:workspaceId/scripts/:id/health': {
		GET: {
			params: z.object({ workspaceId: z.string(), id: z.string() }),
			response: z.object({
				healthy: z.boolean(),
				status: ScriptProcessStatusSchema,
				lastCheck: z.string().datetime(),
			}),
		},
	},
});

export type WorkspaceScriptsApiRoutes = typeof WORKSPACE_SCRIPTS_API_ROUTES;
