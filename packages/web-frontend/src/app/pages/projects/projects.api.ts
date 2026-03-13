import { createTypedFetch } from '@framework/api/api-base';
import { PROJECTS_API_ROUTES } from '@shared/api/projects.contract';
import type {
	CreateProject,
	Project,
	ProjectBoardData,
	ProjectStatusConfig,
	ProjectsListQuery,
	ProjectsListResponse,
	UpdateProject,
} from '@shared/api/projects.contract';
import type { BulkDeleteResponse } from '@shared/common/api-helpers';

/**
 * ===========================================================================================
 * PROJECTS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for projects endpoints.
 * Generated from the PROJECTS_API_ROUTES contract.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(PROJECTS_API_ROUTES);

export const projectsApi = {
	/**
	 * Get projects list with pagination support
	 */
	getProjectsList: (query: ProjectsListQuery): Promise<ProjectsListResponse> => {
		return typedFetch('GET', '/api/projects/', { query }) as Promise<ProjectsListResponse>;
	},

	/**
	 * Get a single project by ID
	 */
	getProjectById: (id: string): Promise<Project> => {
		return typedFetch('GET', '/api/projects/:id', { params: { id } });
	},

	/**
	 * Create a new project
	 */
	createProject: (body: CreateProject): Promise<Project> => {
		return typedFetch('POST', '/api/projects/', { body });
	},

	/**
	 * Update an existing project (with optimistic locking via version)
	 */
	updateProject: (id: string, body: UpdateProject): Promise<Project> => {
		return typedFetch('PATCH', '/api/projects/:id', { params: { id }, body });
	},

	/**
	 * Delete a single project by ID
	 */
	deleteProject: (id: string): Promise<{ success: boolean }> => {
		return typedFetch('DELETE', '/api/projects/:id', { params: { id } });
	},

	/**
	 * Bulk delete multiple projects
	 */
	bulkDeleteProjects: (ids: string[]): Promise<BulkDeleteResponse> => {
		return typedFetch('DELETE', '/api/projects/', { body: { ids } }) as Promise<BulkDeleteResponse>;
	},

	/**
	 * Add workspaces to a project
	 */
	addWorkspacesToProject: (id: string, workspaceIds: string[]): Promise<Project> => {
		return typedFetch('POST', '/api/projects/:id/workspaces', {
			params: { id },
			body: { workspaceIds },
		});
	},

	/**
	 * Get project board data (tasks grouped by status)
	 */
	getProjectBoard: (id: string): Promise<ProjectBoardData> => {
		return typedFetch('GET', '/api/projects/:id/board', { params: { id } });
	},

	/**
	 * Get the status configuration for a project
	 */
	getStatusConfig: (projectId: string): Promise<ProjectStatusConfig> => {
		return typedFetch('GET', '/api/projects/:projectId/status-config', { params: { projectId } });
	},
} as const;
