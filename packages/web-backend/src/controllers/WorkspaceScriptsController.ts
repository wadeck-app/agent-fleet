import { WORKSPACE_SCRIPTS_API_ROUTES } from '@app/shared/api/workspaceScripts.contract';

import type { ScriptProcessService } from '../services/ScriptProcessService';
import type { WorkspaceScriptsService } from '../services/WorkspaceScriptsService';
import type { ScriptLogsStorage } from '../storage/ScriptLogsStorage';
import type { RouteWrapperFunc } from '../utils/fastify-wrapper';
import type { LazyController } from '../utils/lazy-controller-plugin';

/**
 * ===========================================================================================
 * WORKSPACE SCRIPTS CONTROLLER - LAYERED ARCHITECTURE
 * ===========================================================================================
 *
 * Presentation layer for workspace scripts.
 *
 * Responsibilities:
 * - HTTP request/response handling
 * - Route definition
 * - Input validation (via Zod schemas in contracts)
 * - Delegate to service layer
 *
 * Does NOT contain:
 * - Business logic (in services)
 * - Data access (in repositories)
 * - Process management (in ScriptProcessManager)
 *
 * Routes:
 * - GET /api/workspaces/:workspaceId/scripts/ - List scripts with process status
 * - POST /api/workspaces/:workspaceId/scripts/ - Create script
 * - GET /api/workspaces/:workspaceId/scripts/available - Discover available scripts
 * - GET /api/workspaces/:workspaceId/scripts/:id - Get script with process
 * - PATCH /api/workspaces/:workspaceId/scripts/:id - Update script (with optimistic locking)
 * - DELETE /api/workspaces/:workspaceId/scripts/:id - Delete script
 * - POST /api/workspaces/:workspaceId/scripts/:id/start - Start process
 * - POST /api/workspaces/:workspaceId/scripts/:id/stop - Stop process
 * - POST /api/workspaces/:workspaceId/scripts/:id/restart - Restart process
 * - GET /api/workspaces/:workspaceId/scripts/:id/logs - Get paginated logs
 * - DELETE /api/workspaces/:workspaceId/scripts/:id/logs - Clear logs
 * - GET /api/workspaces/:workspaceId/scripts/:id/status - Get process status
 * - GET /api/workspaces/:workspaceId/scripts/:id/health - Health check
 *
 * ===========================================================================================
 */
export default class WorkspaceScriptsController implements LazyController<typeof WORKSPACE_SCRIPTS_API_ROUTES> {
	static routes = WORKSPACE_SCRIPTS_API_ROUTES;

	constructor(
		private readonly workspaceScriptsService: WorkspaceScriptsService,
		private readonly scriptProcessService: ScriptProcessService,
		private readonly scriptLogsStorage: ScriptLogsStorage
	) {}

	configureRoutes(add: RouteWrapperFunc<typeof WORKSPACE_SCRIPTS_API_ROUTES>) {
		/**
		 * GET /api/workspaces/:workspaceId/scripts/
		 * List all scripts for a workspace with their process status
		 */
		add('GET', '/api/workspaces/:workspaceId/scripts/', async ({ params }) => {
			return this.workspaceScriptsService.getScriptsWithProcesses(params.workspaceId);
		});

		/**
		 * POST /api/workspaces/:workspaceId/scripts/
		 * Create a new script configuration
		 */
		add('POST', '/api/workspaces/:workspaceId/scripts/', async ({ params, body }) => {
			return this.workspaceScriptsService.createScript(params.workspaceId, body);
		});

		/**
		 * GET /api/workspaces/:workspaceId/scripts/available
		 * Discover available scripts from workspace package.json
		 */
		add('GET', '/api/workspaces/:workspaceId/scripts/available', async ({ params }) => {
			return this.workspaceScriptsService.discoverAvailableScripts(params.workspaceId);
		});

		/**
		 * GET /api/workspaces/:workspaceId/scripts/:id
		 * Get a single script with its process status
		 */
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

		/**
		 * PATCH /api/workspaces/:workspaceId/scripts/:id
		 * Update a script configuration (with optimistic locking)
		 */
		add('PATCH', '/api/workspaces/:workspaceId/scripts/:id', async ({ params, body }) => {
			return this.workspaceScriptsService.updateScript(params.workspaceId, params.id, body);
		});

		/**
		 * DELETE /api/workspaces/:workspaceId/scripts/:id
		 * Delete a script configuration
		 */
		add('DELETE', '/api/workspaces/:workspaceId/scripts/:id', async ({ params }) => {
			await this.workspaceScriptsService.deleteScript(params.workspaceId, params.id);
			return { success: true };
		});

		/**
		 * POST /api/workspaces/:workspaceId/scripts/:id/start
		 * Start a script process
		 */
		add('POST', '/api/workspaces/:workspaceId/scripts/:id/start', async ({ params }) => {
			return this.scriptProcessService.startProcess(params.workspaceId, params.id);
		});

		/**
		 * POST /api/workspaces/:workspaceId/scripts/:id/stop
		 * Stop a script process
		 */
		add('POST', '/api/workspaces/:workspaceId/scripts/:id/stop', async ({ params }) => {
			return this.scriptProcessService.stopProcess(params.workspaceId, params.id);
		});

		/**
		 * POST /api/workspaces/:workspaceId/scripts/:id/restart
		 * Restart a script process
		 */
		add('POST', '/api/workspaces/:workspaceId/scripts/:id/restart', async ({ params }) => {
			return this.scriptProcessService.restartProcess(params.workspaceId, params.id);
		});

		/**
		 * GET /api/workspaces/:workspaceId/scripts/:id/logs
		 * Get paginated logs for a script
		 * Query params: cursor, limit, level, search
		 */
		add('GET', '/api/workspaces/:workspaceId/scripts/:id/logs', async ({ params, query }) => {
			// Get logs from storage
			const result = await this.scriptLogsStorage.readLogsPaginated(
				params.id,
				query.cursor,
				query.limit,
				query.level,
				query.search
			);

			// Check if process is currently running
			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);
			const isRunning = process?.status === 'running';

			return {
				logs: result.logs,
				nextCursor: result.nextCursor,
				total: result.total,
				isRunning,
			};
		});

		/**
		 * DELETE /api/workspaces/:workspaceId/scripts/:id/logs
		 * Clear logs for a script
		 */
		add('DELETE', '/api/workspaces/:workspaceId/scripts/:id/logs', async ({ params }) => {
			await this.scriptLogsStorage.deleteLogs(params.id);
			return { success: true };
		});

		/**
		 * GET /api/workspaces/:workspaceId/scripts/:id/status
		 * Get process status for a script
		 */
		add('GET', '/api/workspaces/:workspaceId/scripts/:id/status', async ({ params }) => {
			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);

			if (!process) {
				throw new Error(`No process found for script ${params.id}`);
			}

			return process;
		});

		/**
		 * GET /api/workspaces/:workspaceId/scripts/:id/health
		 * Health check for a script process
		 */
		add('GET', '/api/workspaces/:workspaceId/scripts/:id/health', async ({ params }) => {
			const process = await this.scriptProcessService.getProcessStatus(params.workspaceId, params.id);

			if (!process) {
				return {
					healthy: false,
					status: 'stopped' as const,
					lastCheck: new Date().toISOString(),
				};
			}

			// Consider healthy if running or starting
			const healthy = process.status === 'running' || process.status === 'starting';

			return {
				healthy,
				status: process.status,
				lastCheck: new Date().toISOString(),
			};
		});
	}
}
