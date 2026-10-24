import type { HookConfig } from '@wadeck-app/shared-cli/HookDispatcher';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ProjectResolverFactory } from '../config/ProjectResolverFactory.js';
import { parseFlowConfigFile } from './parseFlowConfigFile.js';

/**
 * Reads the `hooks:` section of the project's `.flow/config.yml`.
 *
 * Resolves the project root from `cwd` rather than reading `<cwd>/.flow/config.yml`
 * directly, so a run started from a subdirectory still picks up the project's hooks.
 */
export function loadFlowHooks(cwd: string): Record<string, HookConfig[]> {
	// Throws for a project that cannot be read (legacy layout): running without its hooks
	// would look like "no hooks configured". Only "no project" yields no hooks.
	const resolution = ProjectResolverFactory.create().tryResolve(cwd);
	if (resolution === null) {
		process.stderr.write(`[daemon] No flow hooks loaded: "${cwd}" belongs to no project.\n`);
		return {};
	}
	const configPath = path.join(resolution.projectRoot, '.flow', 'config.yml');
	if (!fs.existsSync(configPath)) {
		return {};
	}
	// Fails rather than running the flow with no hooks: silently dropping every
	// hook because of a typo is worse than refusing to start.
	const raw = parseFlowConfigFile(configPath);
	return (raw?.['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
}
