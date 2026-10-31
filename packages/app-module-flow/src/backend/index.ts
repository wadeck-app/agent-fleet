// violations-suppress: ts/no-barrel-index app-core requires the backend entry of an app-module to be src/backend/index.ts (app-core-cli check)
import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import {
	BUILTIN_PLUGIN_CATALOG,
	FLOW_CONFIG_DIR_NAME,
	FlowQueryService,
	createRegistryProjectFinderFromEnv,
	createRegistryProjectLookupFromEnv,
} from 'flow-core';

import { registerExecutionLogRoutes } from './ExecutionLogRoutes.js';
import { registerExecutionRoutes } from './ExecutionRoutes.js';
import { registerExecutionWidgetRoutes } from './ExecutionWidgetRoutes.js';
import { registerLogRoutes } from './LogRoutes.js';
import { registerPluginRoutes } from './PluginRoutes.js';
import { registerProjectRelatedRoutes } from './ProjectRelatedRoutes.js';
import { registerWorkerRoutes } from './WorkerRoutes.js';

/**
 * backendEntryPath target of the packaged manifest: app-core calls this once at module load.
 * Routes become /api/modules/flow/<subPath> and are removed when the module unloads. Read-only:
 * nothing here starts, stops or modifies a flow, a worker or the daemon.
 */
export default function (ctx: ModuleContext): void {
	// Same location as the flow CLI and daemon (ConfigDir.get(FLOW_CONFIG_DIR_NAME), XDG_CONFIG_HOME honoured), resolved once.
	// Project names come from the shared project registry (XDG_CONFIG_HOME of this process), read on every request.
	const service = FlowQueryService.forConfigDir(
		ConfigDir.get(FLOW_CONFIG_DIR_NAME),
		BUILTIN_PLUGIN_CATALOG,
		createRegistryProjectLookupFromEnv(process.env)
	);

	registerExecutionRoutes(ctx, service);
	registerExecutionLogRoutes(ctx, service);
	registerExecutionWidgetRoutes(ctx, service);
	registerWorkerRoutes(ctx, service);
	registerLogRoutes(ctx, service);
	registerPluginRoutes(ctx, service);
	// Read per request, like the project names above: the registry is shared with the project CLI.
	registerProjectRelatedRoutes(ctx, service, createRegistryProjectFinderFromEnv(process.env));
}
