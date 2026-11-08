import { pruneWorkspaceDirAtStartup } from 'flow-engine';
import * as path from 'node:path';

import type { FlowConfig } from '../config/FlowConfig';

/**
 * Prunes the folders earlier versions created under `<project>/.flow/workspaces` (the native workspace modes `isolated` and
 * `shared`, removed since). No version creates them any more; this only keeps their retention (`workspace.retainDays`,
 * `workspace.maxWorkspaces`) until none is left on any machine.
 *
 * Prunes the workspaces of the project a run belongs to.
 *
 * Keyed on the folder of the project the run resolved to, never on the daemon's own cwd: the daemon is a per-user
 * machine-wide singleton serving every project concurrently, so its launch directory would prune an unrelated
 * project's workspaces (Q#22).
 */
export function pruneProjectWorkspaces(projectPath: string, config: FlowConfig): void {
	pruneWorkspaceDirAtStartup(
		path.join(projectPath, '.flow', 'workspaces'),
		config.workspace.retainDays,
		config.workspace.maxWorkspaces
	);
}
