import type { HookConfig } from '@wadeck-app/shared-cli/HookDispatcher';

import { type ProjectConfigSubject, loadProjectConfig } from '../config/ProjectFlowConfig.js';

/**
 * Reads the `hooks:` section of the flow config of a project (in the project registry, see `loadProjectConfig`).
 *
 * Takes the project the run resolved to (not the client's cwd), so a run started from a subfolder, or from elsewhere
 * with `--project`, picks up the project's hooks.
 *
 * Fails (naming the file) rather than running the flow with no hooks: silently dropping every hook because of a typo,
 * a misplaced key or a config still in the repository is worse than refusing to start.
 */
export function loadFlowHooks(project: ProjectConfigSubject): Record<string, HookConfig[]> {
	return (loadProjectConfig(project).values['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
}
