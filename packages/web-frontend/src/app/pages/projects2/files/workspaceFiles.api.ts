import { createTypedFetch } from '@framework/api/api-base';
import type { DirectoryListing, FileContent } from '@shared/api/workspaceFiles.contract';
import { WORKSPACE_FILES_API_ROUTES } from '@shared/api/workspaceFiles.contract';

/**
 * ===========================================================================================
 * WORKSPACE FILES API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for workspace files endpoints.
 * Generated from the WORKSPACE_FILES_API_ROUTES contract.
 *
 * Provides methods for:
 * - Listing directory contents (tree navigation)
 * - Reading file contents
 * - Writing file contents (save)
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(WORKSPACE_FILES_API_ROUTES);

export const workspaceFilesApi = {
	/**
	 * List directory contents
	 */
	listDirectory: (workspaceId: string, path: string): Promise<DirectoryListing> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/files/tree', {
			params: { workspaceId },
			query: { path },
		});
	},

	/**
	 * Read file content
	 */
	readFileContent: (workspaceId: string, path: string): Promise<FileContent> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/files/content', {
			params: { workspaceId },
			query: { path },
		});
	},

	/**
	 * Write file content (save)
	 */
	writeFileContent: (workspaceId: string, path: string, content: string): Promise<FileContent> => {
		return typedFetch('PUT', '/api/workspaces/:workspaceId/files/content', {
			params: { workspaceId },
			query: { path },
			body: { content },
		});
	},
} as const;
