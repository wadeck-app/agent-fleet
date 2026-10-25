import type { ApprovalProvider, WorkspaceProvider } from 'extension-points';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { flowConfigDir } from '../config/FlowConfigDir.js';
import { launchProjectConfigPath } from '../config/LaunchProjectConfig.js';
import { PluginResolver } from '../config/PluginResolver.js';
import { declaresPlugins } from './declaresPlugins.js';
import { parseFlowConfigFile } from './parseFlowConfigFile.js';

/**
 * Extension points the daemon declares but does not resolve from config yet: it
 * constructs the built-in implementation directly.
 *
 * Configuring one has to be an error. Loading the section and ignoring it would leave the
 * user believing their own implementation was in force when it never ran -- and for
 * routing in particular, the flow would keep working, just not the way they asked.
 */
const UNRESOLVED_PLUGIN_POINTS: Record<string, string> = {
	authentication: 'the built-in shared-token authenticator',
	workerAcceptance: 'the built-in permissive acceptance rules',
	stepDistribution: 'the built-in registered-workers-first order',
	provisioning: 'the built-in bounded-wait-then-fork policy',
	interactivityPolicy: 'the built-in loud failure when no worker has a user interface',
};

/** Names the unresolved plugin sections a config file declares, if any. */
function declaresUnresolvedPlugins(configPath: string): string[] {
	if (!fs.existsSync(configPath)) {
		return [];
	}
	let raw: Record<string, unknown> | null;
	try {
		raw = parseFlowConfigFile(configPath);
	} catch {
		// declaresPlugins already reports a parse failure with the path; do not double-report.
		return [];
	}
	const plugins = raw?.['plugins'];
	if (typeof plugins !== 'object' || plugins === null) {
		return [];
	}
	// violations-suppress: ts/no-unsafe-type-cast parsed YAML has no static shape; the plugins key is checked before use
	const declared = plugins as Record<string, unknown>;
	return Object.keys(UNRESOLVED_PLUGIN_POINTS).filter(point => declared[point] !== undefined);
}

/**
 * Attempts to load plugin config. Returns empty providers when no config file declares
 * a `plugins:` section (backward-compatible). Re-throws on config parse errors or
 * plugin load failures.
 */
export async function tryResolvePlugins(): Promise<{
	workspaceProvider?: WorkspaceProvider;
	approvalProvider?: ApprovalProvider;
}> {
	const globalConfigPath = path.join(flowConfigDir(), 'config.yml');
	const envOverride = process.env['FLOW_CONFIG'];

	// The daemon is a per-user machine-wide singleton, so it has no single project. The project config of its launch
	// directory (registered project only) still applies; a launch directory in no project means the global config alone,
	// reported on stderr, and an unregistered folder whose config declares plugins is an explicit error.
	const projectConfigPath = launchProjectConfigPath(process.cwd());

	if (
		!envOverride &&
		!declaresPlugins(globalConfigPath) &&
		(projectConfigPath === null || !declaresPlugins(projectConfigPath))
	) {
		return {};
	}

	for (const configPath of [globalConfigPath, projectConfigPath]) {
		if (configPath === null) {
			continue;
		}
		for (const point of declaresUnresolvedPlugins(configPath)) {
			throw new Error(
				`"${configPath}" configures plugins.${point}, but the daemon does not load a ${point} plugin yet -- it uses ${UNRESOLVED_PLUGIN_POINTS[point] ?? 'a built-in implementation'}. Remove that section, or track the work to make it pluggable, rather than assuming it is active.`
			);
		}
	}

	return PluginResolver.create().resolveAll();
}
