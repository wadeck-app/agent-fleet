import { z } from 'zod';
import { defineRoutes } from '../route-builder.js';

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

export const WORKSPACES_API_ROUTES = defineRoutes({
	'/api/workspaces/': {
		GET: {
			response: WorkspacesDataSchema,
		},
	},
});

export type WorkspacesApiRoutes = typeof WORKSPACES_API_ROUTES;
