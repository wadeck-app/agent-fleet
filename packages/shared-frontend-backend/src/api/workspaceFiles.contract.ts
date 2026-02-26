import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * File entry type - file or directory
 */
export const FileEntryTypeSchema = z.enum(['file', 'directory']);

/**
 * Single file/directory entry in a listing
 */
export const FileEntrySchema = z.object({
	name: z.string(),
	// Relative path within the workspace
	path: z.string(),
	type: FileEntryTypeSchema,
	size: z.number().optional(),
	lastModified: z.string().optional(),
});

/**
 * Directory listing response
 */
export const DirectoryListingSchema = z.object({
	entries: z.array(FileEntrySchema),
	path: z.string(),
});

/**
 * File content response
 */
export const FileContentSchema = z.object({
	path: z.string(),
	content: z.string(),
	size: z.number(),
	lastModified: z.string(),
});

/**
 * Write file request body
 */
export const WriteFileBodySchema = z.object({
	content: z.string(),
});

/**
 * Common params for workspace file routes
 */
const WorkspaceIdParamSchema = z.object({
	workspaceId: z.string(),
});

/**
 * Query params for file operations - relative path within workspace
 */
const FilePathQuerySchema = z.object({
	path: z.string(),
});

export type FileEntryType = z.infer<typeof FileEntryTypeSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type DirectoryListing = z.infer<typeof DirectoryListingSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type WriteFileBody = z.infer<typeof WriteFileBodySchema>;

export const WORKSPACE_FILES_API_ROUTES = defineRoutes({
	'/api/workspaces/:workspaceId/files/tree': {
		GET: {
			params: WorkspaceIdParamSchema,
			query: FilePathQuerySchema,
			response: DirectoryListingSchema,
		},
	},
	'/api/workspaces/:workspaceId/files/content': {
		GET: {
			params: WorkspaceIdParamSchema,
			query: FilePathQuerySchema,
			response: FileContentSchema,
		},
		PUT: {
			params: WorkspaceIdParamSchema,
			query: FilePathQuerySchema,
			body: WriteFileBodySchema,
			response: FileContentSchema,
		},
	},
});

export type WorkspaceFilesApiRoutes = typeof WORKSPACE_FILES_API_ROUTES;
