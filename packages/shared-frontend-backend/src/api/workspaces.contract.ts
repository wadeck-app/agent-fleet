import { z } from 'zod';

import { defineRoutes } from '../route-builder';

export const WorkspaceModeSchema = z.enum(['development', 'production', 'staging']);
export const WorkspaceStatusSchema = z.enum(['active', 'locked', 'cleaning', 'error']);

export const GitStatusSchema = z.object({
	ahead: z.number(),
	behind: z.number(),
	modified: z.number(),
	untracked: z.number(),
});

export const WorkspaceSchema = z.object({
	id: z.string(),
	path: z.string(),
	mode: WorkspaceModeSchema,
	tasksCount: z.number(),
	gitBranch: z.string().optional(),
	status: WorkspaceStatusSchema,
	createdAt: z.string(),
	lastUsed: z.string(),
	gitStatus: GitStatusSchema.optional(),
	activeTasks: z.array(z.string()).optional(),
});

export const WorkspacesDataSchema = z.object({
	timestamp: z.string(),
	summary: z.object({
		total: z.number(),
		active: z.number(),
		locked: z.number(),
		cleaning: z.number(),
		errorCount: z.number(),
	}),
	workspaces: z.array(WorkspaceSchema),
});

export type WorkspaceMode = z.infer<typeof WorkspaceModeSchema>;
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;
export type GitStatus = z.infer<typeof GitStatusSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspacesData = z.infer<typeof WorkspacesDataSchema>;

/**
 * Extended query parameters with pagination, sorting, and search support
 */
export const WorkspacesListQuerySchema = z.object({
	// Pagination
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce.number().int().positive().max(100).optional(),
	// Sorting
	sortBy: z.string().optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	// Search
	search: z.string().optional(),
	// Domain-specific filters (future)
	status: WorkspaceStatusSchema.optional(),
	mode: WorkspaceModeSchema.optional(),
});

/**
 * Paginated workspaces list response
 */
export const WorkspacesListResponseSchema = z.object({
	items: z.array(WorkspaceSchema),
	pagination: z
		.object({
			total: z.number(),
			page: z.number(),
			pageSize: z.number(),
			totalPages: z.number(),
		})
		.optional(),
});

export type WorkspacesListQuery = z.infer<typeof WorkspacesListQuerySchema>;
export type WorkspacesListResponse = z.infer<typeof WorkspacesListResponseSchema>;

export const WORKSPACES_API_ROUTES = defineRoutes({
	'/api/workspaces/': {
		GET: {
			query: WorkspacesListQuerySchema.optional(),
			response: z.union([WorkspacesDataSchema, WorkspacesListResponseSchema]),
		},
	},
});

export type WorkspacesApiRoutes = typeof WORKSPACES_API_ROUTES;
