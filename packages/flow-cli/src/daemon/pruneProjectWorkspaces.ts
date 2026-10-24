import { WorkspaceManager } from 'flow-engine';
import * as path from 'node:path';

import type { FlowConfig } from '../config/FlowConfig';
import { ProjectResolverFactory } from '../config/ProjectResolverFactory.js';

/**
 * Prunes the workspaces of the project a run belongs to.
 *
 * Keyed on the requesting client's cwd, never on the daemon's own: the daemon is
 * a per-user machine-wide singleton serving every project concurrently, so its
 * launch directory would prune an unrelated project's workspaces (Q#22).
 */
export function pruneProjectWorkspaces(cwd: string, config: FlowConfig): void {
	// Throws for a project that cannot be read (legacy layout); only "no project" skips.
	const resolution = ProjectResolverFactory.create().tryResolve(cwd);
	if (resolution === null) {
		process.stderr.write(`[daemon] Skipped workspace pruning: "${cwd}" belongs to no project.\n`);
		return;
	}
	WorkspaceManager.pruneOldWorkspaceDir(
		path.join(resolution.projectRoot, '.flow', 'workspaces'),
		config.workspace.retainDays,
		config.workspace.maxWorkspaces
	);
}
