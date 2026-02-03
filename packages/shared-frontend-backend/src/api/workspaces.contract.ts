import { z } from 'zod';

import { defineRoutes } from '../route-builder';

export const WorkspaceModeSchema = z.enum(['development', 'production', 'staging']);
export const WorkspaceStatusSchema = z.enum(['active', 'locked', 'cleaning', 'error']);

/**
 * Workspace color schema - hex color string
 */
export const WorkspaceColorSchema = z
	.string()
	.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
	.optional();

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
	name: z.string().optional(),
	description: z.string().optional(),
	color: WorkspaceColorSchema,
	activeWorkerId: z.string().optional(),
	projectId: z.string().optional(),
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
export type WorkspaceColor = z.infer<typeof WorkspaceColorSchema>;
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

/**
 * DTO for creating a new workspace
 */
export const CreateWorkspaceDtoSchema = z.object({
	path: z.string().min(1, 'Path is required'),
	name: z.string().optional(),
	description: z.string().optional(),
	color: WorkspaceColorSchema,
	mode: WorkspaceModeSchema.optional(),

	gitOptions: z
		.object({
			strategy: z.enum(['none', 'clone', 'worktree']),
			repositoryUrl: z.string().url().optional(), // For clone
			sourceWorkspaceId: z.string().optional(), // For worktree
			branch: z.string().optional(), // Branch to checkout/create
		})
		.optional(),
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceDtoSchema>;

/**
 * DTO for updating workspace metadata
 * Note: projectId association is now managed via Projects API (PATCH /api/projects/:id)
 */
export const UpdateWorkspaceDtoSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	color: z.string().optional(),
});

export type UpdateWorkspaceDto = z.infer<typeof UpdateWorkspaceDtoSchema>;

export const WORKSPACES_API_ROUTES = defineRoutes({
	'/api/workspaces/': {
		GET: {
			query: WorkspacesListQuerySchema.optional(),
			response: z.union([WorkspacesDataSchema, WorkspacesListResponseSchema]),
		},
		POST: {
			body: CreateWorkspaceDtoSchema,
			response: WorkspaceSchema,
		},
	},
	'/api/workspaces/:id': {
		PATCH: {
			params: z.object({ id: z.string() }),
			body: UpdateWorkspaceDtoSchema,
			response: WorkspaceSchema,
		},
	},
});

export type WorkspacesApiRoutes = typeof WORKSPACES_API_ROUTES;
