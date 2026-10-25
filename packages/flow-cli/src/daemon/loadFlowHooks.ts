import type { HookConfig } from '@wadeck-app/shared-cli/HookDispatcher';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseFlowConfigFile } from './parseFlowConfigFile.js';

/**
 * Reads the `hooks:` section of the project's `.flow/config.yml`.
 *
 * Takes the folder of the registered project the run resolved to (not the client's cwd), so a run started from a
 * subfolder, or from elsewhere with `--project`, picks up the project's hooks.
 */
export function loadFlowHooks(projectPath: string): Record<string, HookConfig[]> {
	const configPath = path.join(projectPath, '.flow', 'config.yml');
	if (!fs.existsSync(configPath)) {
		return {};
	}
	// Fails rather than running the flow with no hooks: silently dropping every
	// hook because of a typo is worse than refusing to start.
	const raw = parseFlowConfigFile(configPath);
	return (raw?.['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
}
