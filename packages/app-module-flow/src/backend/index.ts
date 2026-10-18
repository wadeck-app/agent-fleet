// violations-suppress: ts/no-barrel-index app-core requires the backend entry of an app-module to be src/backend/index.ts (app-core-cli check)
import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { BUILTIN_PLUGIN_CATALOG, FlowQueryService } from 'flow-core';

import { registerExecutionRoutes } from './ExecutionRoutes.js';
import { registerLogRoutes } from './LogRoutes.js';
import { registerPluginRoutes } from './PluginRoutes.js';
import { registerWorkerRoutes } from './WorkerRoutes.js';

/**
 * backendEntryPath target of the packaged manifest: app-core calls this once at module load.
 * Routes become /api/modules/flow/<subPath> and are removed when the module unloads. Read-only:
 * nothing here starts, stops or modifies a flow, a worker or the daemon.
 */
export default function (ctx: ModuleContext): void {
	// Same location as the flow CLI and daemon (ConfigDir.get('flow'), XDG_CONFIG_HOME honoured), resolved once.
	const service = FlowQueryService.forConfigDir(ConfigDir.get('flow'), BUILTIN_PLUGIN_CATALOG);

	registerExecutionRoutes(ctx, service);
	registerWorkerRoutes(ctx, service);
	registerLogRoutes(ctx, service);
	registerPluginRoutes(ctx, service);
}
