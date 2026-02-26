import { WORKSPACE_FILES_API_ROUTES } from '@app/shared/api/workspaceFiles.contract';
import { WORKSPACE_SCRIPTS_API_ROUTES } from '@app/shared/api/workspaceScripts.contract';
import { WORKSPACES_API_ROUTES } from '@app/shared/api/workspaces.contract';

import type { ScriptProcessService } from '../services/ScriptProcessService';
import type { WorkspaceFileService } from '../services/WorkspaceFileService';
import type { WorkspaceScriptsService } from '../services/WorkspaceScriptsService';
import type { WorkspacesService } from '../services/WorkspacesService';
import type { ScriptLogsStorage } from '../storage/ScriptLogsStorage';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * Merged routes for both workspaces and workspace scripts
 */
const MERGED_ROUTES = {
	...WORKSPACES_API_ROUTES,
	...WORKSPACE_FILES_API_ROUTES,
	...WORKSPACE_SCRIPTS_API_ROUTES,
	__baseUrl: '/api/workspaces',
};
type MergedRoutes = typeof MERGED_ROUTES;

/**
 * ===========================================================================================
 * UNIFIED WORKSPACES + SCRIPTS CONTROLLER
 * ===========================================================================================
 *
 * Combines WorkspacesController and WorkspaceScriptsController to handle both:
 * - Base workspace routes (/api/workspaces/, /api/workspaces/:id)
 * - Script routes (/api/workspaces/:workspaceId/scripts/*)
 *
 * ===========================================================================================
 */
export default class WorkspacesWithScriptsController implements LazyController<MergedRoutes> {
	static routes = MERGED_ROUTES;

	constructor(
		private readonly workspacesService: WorkspacesService,
		private readonly workspaceScriptsService: WorkspaceScriptsService,
		private readonly scriptProcessService: ScriptProcessService,
		private readonly scriptLogsStorage: ScriptLogsStorage,
		private readonly workspaceFileService: WorkspaceFileService
	) {}

	configureRoutes(add: RouteWrapperFunc<MergedRoutes>) {
		// ========================================
		// Base Workspace Routes
		// ========================================

		add('GET', '/api/workspaces/', async ({ query }) => {
			if (query && (query.page !== undefined || query.pageSize !== undefined)) {
				return this.workspacesService.getWorkspacesList(query);
			}
			return this.workspacesService.getWorkspacesData();
		});

		add('POST', '/api/workspaces/', async ({ body }) => {
			return this.workspacesService.createWorkspace(body);
		});

		add('PATCH', '/api/workspaces/:id', async ({ params, body }) => {
			return this.workspacesService.updateWorkspace(params.id, body);
		});

		// ========================================
		// File Routes
		// ========================================

		add('GET', '/api/workspaces/:workspaceId/files/tree', async ({ params, query }) => {
			const workspacePath = await this.workspaceFileService.resolveWorkspacePath(params.workspaceId);
			return this.workspaceFileService.listDirectory(workspacePath, query.path);
		});

		add('GET', '/api/workspaces/:workspaceId/files/content', async ({ params, query }) => {
			const workspacePath = await this.workspaceFileService.resolveWorkspacePath(params.workspaceId);
			return this.workspaceFileService.readFile(workspacePath, query.path);
		});

		add('PUT', '/api/workspaces/:workspaceId/files/content', async ({ params, query, body }) => {
			const workspacePath = await this.workspaceFileService.resolveWorkspacePath(params.workspaceId);
			return this.workspaceFileService.writeFile(workspacePath, query.path, body.content);
		});

		// ========================================
		// Script Routes
		// ========================================

		add('GET', '/api/workspaces/:workspaceId/scripts/', async ({ params }) => {
			return this.workspaceScriptsService.getScriptsWithProcesses(params.workspaceId);
		});

		add('POST', '/api/workspaces/:workspaceId/scripts/', async ({ params, body }) => {
			return this.workspaceScriptsService.createScript(params.workspaceId, body);
		});

		add('GET', '/api/workspaces/:workspaceId/scripts/available', async ({ params }) => {
			return this.workspaceScriptsService.discoverAvailableScripts(params.workspaceId);
		});

		add('GET', '/api/workspaces/:workspaceId/scripts/:id', async ({ params }) => {
			const scriptWithProcess = await this.workspaceScriptsService.getScriptWithProcess(
				params.workspaceId,
				params.id
			);

			if (!scriptWithProcess) {
				throw new Error(`Script ${params.id} not found in workspace ${params.workspaceId}`);
			}

			return scriptWithProcess;
		});

		add('PATCH', '/api/workspaces/:workspaceId/scripts/:id', async ({ params, body }) => {
			return this.workspaceScriptsService.updateScript(params.workspaceId, params.id, body);
		});

		add('DELETE', '/api/workspaces/:workspaceId/scripts/:id', async ({ params }) => {
			await this.workspaceScriptsService.deleteScript(params.workspaceId, params.id);
			return { success: true };
		});

		add('POST', '/api/workspaces/:workspaceId/scripts/:id/start', async ({ params }) => {
			return this.scriptProcessService.startProcess(params.workspaceId, params.id);
		});

		add('POST', '/api/workspaces/:workspaceId/scripts/:id/stop', async ({ params }) => {
			return this.scriptProcessService.stopProcess(params.workspaceId, params.id);
		});

		add('POST', '/api/workspaces/:workspaceId/scripts/:id/restart', async ({ params }) => {
			return this.scriptProcessService.restartProcess(params.workspaceId, params.id);
		});

		add('GET', '/api/workspaces/:workspaceId/scripts/:id/logs', async ({ params, query }) => {
			const result = await this.scriptLogsStorage.readLogsPaginated(
				params.id,
				query.cursor,
				query.limit,
				query.level,
				query.search
			);

			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);
			const isRunning = process?.status === 'running';

			return {
				logs: result.logs,
				nextCursor: result.nextCursor,
				total: result.total,
				isRunning,
			};
		});

		add('DELETE', '/api/workspaces/:workspaceId/scripts/:id/logs', async ({ params }) => {
			await this.scriptLogsStorage.deleteLogs(params.id);
			return { success: true };
		});

		add('GET', '/api/workspaces/:workspaceId/scripts/:id/status', async ({ params }) => {
			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);

			if (!process) {
				throw new Error(`No process found for script ${params.id}`);
			}

			return process;
		});

		add('GET', '/api/workspaces/:workspaceId/scripts/:id/health', async ({ params }) => {
			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);

			if (!process) {
				return {
					healthy: false,
					status: 'stopped' as const,
					lastCheck: new Date().toISOString(),
				};
			}

			const healthy = process.status === 'running' || process.status === 'starting';

			return {
				healthy,
				status: process.status,
				lastCheck: new Date().toISOString(),
			};
		});
	}
}
