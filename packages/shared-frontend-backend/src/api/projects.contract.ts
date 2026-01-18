import { z } from 'zod';

import {
	type BulkDeleteRequest,
	BulkDeleteRequestSchema,
	type BulkDeleteResponse,
	BulkDeleteResponseSchema,
} from '../common/api-helpers';
import { defineRoutes } from '../route-builder';

/**
 * Project icon schema - Lucide icon names (60 icons)
 */
export const ProjectIconSchema = z
	.enum([
		// Development & Code
		'FolderKanban',
		'Code',
		'Terminal',
		'FileCode',
		'GitBranch',
		'Bug',
		'TestTube',
		'Binary',
		'Braces',
		'CodeSquare',
		// Devices & Hardware
		'Laptop',
		'Server',
		'Database',
		'Cloud',
		'Cpu',
		'HardDrive',
		'Wifi',
		'Smartphone',
		'Monitor',
		'Tablet',
		// Organization & Structure
		'Boxes',
		'Package',
		'Layers',
		'Grid3x3',
		'LayoutGrid',
		'Workflow',
		'Folder',
		'Archive',
		'Inbox',
		'FileStack',
		// Actions & Progress
		'Rocket',
		'Zap',
		'Target',
		'TrendingUp',
		'Activity',
		'BarChart',
		'PieChart',
		'LineChart',
		'Play',
		'FastForward',
		// Tools & Settings
		'Settings2',
		'Cog',
		'Hammer',
		'Wrench',
		'Sliders',
		'Filter',
		'Search',
		'ScanLine',
		'Gauge',
		// Communication & Social
		'MessageSquare',
		'Mail',
		'Bell',
		'Users',
		'User',
		'UserPlus',
		'Globe',
		'Share2',
		'Link',
		'Megaphone',
		// Business & Professional
		'Briefcase',
		'BookOpen',
		'GraduationCap',
		'Award',
		'Trophy',
		'Crown',
		'Building',
		'Store',
		'ShoppingCart',
		'CreditCard',
		// Creative & Design
		'Sparkles',
		'Palette',
		'Paintbrush',
		'Image',
		'Camera',
		'Video',
		'Music',
		'Lightbulb',
		'Feather',
		'Pen',
		// Status & Indicators
		'Star',
		'Heart',
		'Shield',
		'Lock',
		'Key',
		'Eye',
		'CheckCircle',
		'AlertCircle',
		'Info',
		'Flag',
	])
	.optional();

/**
 * Project icon color schema - hex color for icon
 */
export const ProjectIconColorSchema = z
	.string()
	.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
	.optional();

/**
 * Project schema - Full project entity
 */
export const ProjectSchema = z.object({
	id: z.string(),
	name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
	description: z.string().max(500, 'Description must be less than 500 characters').optional(),
	workspaceIds: z.array(z.string()).default([]),
	taskCount: z.number().int().min(0).default(0),
	icon: ProjectIconSchema,
	iconColor: ProjectIconColorSchema,
	archived: z.boolean().default(false),
	pinned: z.boolean().default(false),
	order: z.number().int().min(0).default(0),
	createdAt: z.string(), // ISO 8601
	updatedAt: z.string(), // ISO 8601
	version: z.number().int().min(0), // For optimistic locking
});

/**
 * Create project request schema
 */
export const CreateProjectSchema = ProjectSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	version: true,
	taskCount: true,
	pinned: true,
	order: true,
});

/**
 * Update project request schema (partial with version for optimistic locking)
 */
export const UpdateProjectSchema = ProjectSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	taskCount: true,
})
	.partial()
	.required({ version: true });

/**
 * Query parameters for filtering projects
 */
export const ProjectsQuerySchema = z.object({
	archived: z.coerce.boolean().optional(),
	workspaceId: z.string().optional(),
});

/**
 * Extended query parameters with pagination, sorting, and search support
 */
export const ProjectsListQuerySchema = z.object({
	// Pagination
	page: z.coerce.number().int().positive().optional(),
	pageSize: z.coerce.number().int().positive().max(100).optional(),
	// Sorting
	sortBy: z.string().optional(),
	sortOrder: z.enum(['asc', 'desc']).optional(),
	// Search
	search: z.string().optional(),
	// Filters
	archived: z.coerce.boolean().optional(),
	workspaceId: z.string().optional(),
});

/**
 * Projects list response with summary stats
 */
export const ProjectsDataSchema = z.object({
	timestamp: z.string(),
	summary: z.object({
		total: z.number(),
		active: z.number(),
		archived: z.number(),
	}),
	projects: z.array(ProjectSchema),
});

/**
 * Paginated projects list response
 */
export const ProjectsListResponseSchema = z.object({
	items: z.array(ProjectSchema),
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
 * Add workspaces to project request
 */
export const AddWorkspacesToProjectSchema = z.object({
	workspaceIds: z.array(z.string()).min(1, 'At least one workspace ID is required'),
});

/**
 * Task status for board grouping
 */
export const TaskStatusForBoardSchema = z.enum([
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
 * Project board data - tasks grouped by status
 */
export const ProjectBoardDataSchema = z.object({
	projectId: z.string(),
	projectName: z.string(),
	tasksByStatus: z.record(z.string(), z.array(z.any())), // Status -> Task[]
	timestamp: z.string(),
});

// Type exports
export type ProjectIcon = z.infer<typeof ProjectIconSchema>;
export type ProjectIconColor = z.infer<typeof ProjectIconColorSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
export type ProjectsQuery = z.infer<typeof ProjectsQuerySchema>;
export type ProjectsData = z.infer<typeof ProjectsDataSchema>;
export type ProjectsListQuery = z.infer<typeof ProjectsListQuerySchema>;
export type ProjectsListResponse = z.infer<typeof ProjectsListResponseSchema>;
export type AddWorkspacesToProject = z.infer<typeof AddWorkspacesToProjectSchema>;
export type TaskStatusForBoard = z.infer<typeof TaskStatusForBoardSchema>;
export type ProjectBoardData = z.infer<typeof ProjectBoardDataSchema>;

/**
 * Projects API routes
 */
export const PROJECTS_API_ROUTES = defineRoutes({
	'/api/projects/': {
		GET: {
			query: ProjectsListQuerySchema,
			response: z.union([ProjectsDataSchema, ProjectsListResponseSchema]),
		},
		POST: {
			body: CreateProjectSchema,
			response: ProjectSchema,
		},
		DELETE: {
			body: BulkDeleteRequestSchema,
			response: BulkDeleteResponseSchema,
		},
	},
	'/api/projects/:id': {
		GET: {
			params: z.object({ id: z.string() }),
			response: ProjectSchema,
		},
		PATCH: {
			params: z.object({ id: z.string() }),
			body: UpdateProjectSchema,
			response: ProjectSchema,
		},
		DELETE: {
			params: z.object({ id: z.string() }),
			response: z.object({ success: z.boolean() }),
		},
	},
	'/api/projects/:id/workspaces': {
		POST: {
			params: z.object({ id: z.string() }),
			body: AddWorkspacesToProjectSchema,
			response: ProjectSchema,
		},
	},
	'/api/projects/:id/board': {
		GET: {
			params: z.object({ id: z.string() }),
			response: ProjectBoardDataSchema,
		},
	},
});

export type ProjectsApiRoutes = typeof PROJECTS_API_ROUTES;
