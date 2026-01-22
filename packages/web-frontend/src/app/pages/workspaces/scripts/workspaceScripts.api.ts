import { createTypedFetch } from '@framework/api/api-base';
import type {
	AvailableScript,
	CreateWorkspaceScript,
	PaginatedScriptLogsQuery,
	PaginatedScriptLogsResponse,
	ScriptProcess,
	ScriptProcessWithConfig,
	UpdateWorkspaceScript,
	WorkspaceScript,
} from '@shared/api/workspaceScripts.contract';
import { WORKSPACE_SCRIPTS_API_ROUTES } from '@shared/api/workspaceScripts.contract';

/**
 * ===========================================================================================
 * WORKSPACE SCRIPTS API CLIENT
 * ===========================================================================================
 *
 * Type-safe API client for workspace scripts endpoints.
 * Generated from the WORKSPACE_SCRIPTS_API_ROUTES contract.
 *
 * Provides methods for:
 * - Listing and discovering scripts
 * - Creating, updating, and deleting script configurations
 * - Starting, stopping, and restarting script processes
 * - Fetching and managing script logs
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(WORKSPACE_SCRIPTS_API_ROUTES);

export const workspaceScriptsApi = {
	/**
	 * List all scripts for a workspace with their current process status
	 */
	listWorkspaceScripts: (workspaceId: string): Promise<ScriptProcessWithConfig[]> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/', {
			params: { workspaceId },
		});
	},

	/**
	 * Discover available scripts from package.json
	 */
	discoverAvailableScripts: (workspaceId: string): Promise<AvailableScript[]> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/available', {
			params: { workspaceId },
		});
	},

	/**
	 * Get a single script with its process status
	 */
	getWorkspaceScript: (workspaceId: string, scriptId: string): Promise<ScriptProcessWithConfig> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/:id', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Create a new workspace script configuration
	 */
	createWorkspaceScript: (workspaceId: string, data: CreateWorkspaceScript): Promise<WorkspaceScript> => {
		return typedFetch('POST', '/api/workspaces/:workspaceId/scripts/', {
			params: { workspaceId },
			body: data,
		});
	},

	/**
	 * Update an existing workspace script configuration
	 */
	updateWorkspaceScript: (
		workspaceId: string,
		scriptId: string,
		data: UpdateWorkspaceScript
	): Promise<WorkspaceScript> => {
		return typedFetch('PATCH', '/api/workspaces/:workspaceId/scripts/:id', {
			params: { workspaceId, id: scriptId },
			body: data,
		});
	},

	/**
	 * Delete a workspace script configuration
	 */
	deleteWorkspaceScript: (workspaceId: string, scriptId: string): Promise<{ success: boolean }> => {
		return typedFetch('DELETE', '/api/workspaces/:workspaceId/scripts/:id', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Start a script process
	 */
	startScript: (workspaceId: string, scriptId: string): Promise<ScriptProcess> => {
		return typedFetch('POST', '/api/workspaces/:workspaceId/scripts/:id/start', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Stop a script process
	 */
	stopScript: (workspaceId: string, scriptId: string): Promise<ScriptProcess> => {
		return typedFetch('POST', '/api/workspaces/:workspaceId/scripts/:id/stop', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Restart a script process (stop then start)
	 */
	restartScript: (workspaceId: string, scriptId: string): Promise<ScriptProcess> => {
		return typedFetch('POST', '/api/workspaces/:workspaceId/scripts/:id/restart', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Get script process status
	 */
	getScriptStatus: (workspaceId: string, scriptId: string): Promise<ScriptProcess> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/:id/status', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Get paginated logs for a script
	 */
	getScriptLogs: (
		workspaceId: string,
		scriptId: string,
		query: PaginatedScriptLogsQuery
	): Promise<PaginatedScriptLogsResponse> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/:id/logs', {
			params: { workspaceId, id: scriptId },
			query,
		});
	},

	/**
	 * Clear all logs for a script
	 */
	clearScriptLogs: (workspaceId: string, scriptId: string): Promise<{ success: boolean }> => {
		return typedFetch('DELETE', '/api/workspaces/:workspaceId/scripts/:id/logs', {
			params: { workspaceId, id: scriptId },
		});
	},

	/**
	 * Get script health status
	 */
	getScriptHealth: (
		workspaceId: string,
		scriptId: string
	): Promise<{ healthy: boolean; status: string; lastCheck: string }> => {
		return typedFetch('GET', '/api/workspaces/:workspaceId/scripts/:id/health', {
			params: { workspaceId, id: scriptId },
		});
	},
} as const;
