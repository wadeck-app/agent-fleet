// violations-suppress: ts/no-barrel-index app-core requires the backend entry of an app-module to be src/backend/index.ts (app-core-cli check)
import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import { FLOW_CONFIG_DIR_NAME, FlowQueryService } from 'flow-core';

import { registerGraphRoutes } from './GraphRoutes.js';

/**
 * backendEntryPath target of the packaged manifest: app-core calls this once at module load.
 * Routes become /api/modules/flow-chart/<subPath> and are removed when the module unloads. Read-only.
 */
export default function (ctx: ModuleContext): void {
	// Same location as the flow CLI and daemon (ConfigDir.get(FLOW_CONFIG_DIR_NAME), XDG_CONFIG_HOME honoured), resolved once.
	registerGraphRoutes(ctx, FlowQueryService.forConfigDir(ConfigDir.get(FLOW_CONFIG_DIR_NAME)));
}
