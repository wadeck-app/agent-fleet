import { FlowCoreError } from '../errors.js';

/**
 * What listing and describing plugins reads of a manifest: its id and the names of its implementations. A full
 * `PluginManifest` (extension-points) satisfies it; so does BUILTIN_PLUGIN_CATALOG, which carries no code.
 */
export interface PluginCatalogSource {
	pluginId: string;
	implementations: Record<string, Record<string, unknown>>;
}

export interface PluginEntry {
	id: string;
	extensionPoint: string;
	typeString: string;
}

export interface PluginConfig {
	extensionPoint: string;
	snippet: string;
	options: Record<string, string>;
}

export interface PluginDescription {
	id: string;
	extensionPoint: string;
	typeString: string;
	snippet: string;
	options: Record<string, string>;
}

/** The requested plugin is not one flow ships documentation for. */
export class UnknownPluginError extends FlowCoreError {
	constructor(pluginId: string) {
		super(`unknown plugin '${pluginId}'. Run 'flow plugins list' to see available plugins.`, 'unknown-plugin');
	}
}

/** Configuration documentation of the built-in plugins. */
export const PLUGIN_CONFIGS: Record<string, PluginConfig> = {
	none: {
		extensionPoint: 'workspace',
		snippet: `# Add to .flow/config.yml:

plugins:
  workspace:
    instance:
      type: plugins.none.default`,
		options: {},
	},
	worktree: {
		extensionPoint: 'workspace',
		snippet: `# Add to .flow/config.yml:

plugins:
  workspace:
    instance:
      type: plugins.worktree.default
      options:
        baseDir: /absolute/path/to/worktrees   # required
        prefix: task-                           # optional, branch name prefix`,
		options: {
			baseDir: 'Absolute path where git worktrees are created (required)',
			prefix: 'Prefix prepended to branch names (optional)',
		},
	},
	'cli-approval': {
		extensionPoint: 'approval',
		snippet: `# Add to .flow/config.yml:

plugins:
  approval:
    instance:
      type: plugins.cli-approval.default

# TTY fallback: loaded automatically when no approval plugin is configured
# and flow worker detects a TTY. No config needed for interactive use.`,
		options: {},
	},
	'file-approval': {
		extensionPoint: 'approval',
		snippet: `# Add to .flow/config.yml:

plugins:
  approval:
    instance:
      type: plugins.file-approval.default
      options:
        dir: /absolute/path/to/approvals   # default: $FLOW_APPROVAL_DIR or ~/.config/flow/approvals
        timeoutMs: 1800000                 # default: 30 min
        pollIntervalMs: 500               # default: 500 ms
        settleMs: 2000                    # default: 2 s, grace for half-written response files

# Request file: <dir>/<executionId>_<stepId>.request.json
# Response file: <dir>/<executionId>_<stepId>.response.json  (you create this)
# After answer: both moved to <dir>/answered/`,
		options: {
			dir: 'Absolute path for request/response files (default: $FLOW_APPROVAL_DIR or ~/.config/flow/approvals)',
			timeoutMs: 'How long to wait for a response before failing (default: 1800000 = 30 min)',
			pollIntervalMs: 'How often to check for the response file (default: 500 ms)',
			settleMs: 'Grace period for half-written response files (default: 2000 ms)',
		},
	},
};

/** One entry per implementation of every manifest, in manifest order. */
export function listPlugins(manifests: Record<string, PluginCatalogSource>): PluginEntry[] {
	const entries: PluginEntry[] = [];
	for (const manifest of Object.values(manifests)) {
		for (const [extensionPoint, impls] of Object.entries(manifest.implementations)) {
			for (const implName of Object.keys(impls)) {
				entries.push({
					id: manifest.pluginId,
					extensionPoint,
					typeString: `plugins.${manifest.pluginId}.${implName}`,
				});
			}
		}
	}
	return entries;
}

/** The table `flow plugins list` prints. */
export function formatPluginTable(entries: PluginEntry[]): string {
	const header = `${'ID'.padEnd(18)}${'EXTENSION'.padEnd(14)}TYPE STRING`;
	const rows = entries.map(e => `${e.id.padEnd(18)}${e.extensionPoint.padEnd(14)}${e.typeString}`);
	return [header, ...rows].join('\n');
}

/** Config snippet and options of one plugin. Throws {@link UnknownPluginError} for an undocumented id. */
export function describePlugin(pluginId: string, manifests: Record<string, PluginCatalogSource>): PluginDescription {
	const cfg = PLUGIN_CONFIGS[pluginId];
	if (cfg === undefined) {
		throw new UnknownPluginError(pluginId);
	}
	const entry = listPlugins(manifests).find(e => e.id === pluginId);
	return {
		id: pluginId,
		extensionPoint: cfg.extensionPoint,
		typeString: entry?.typeString ?? `plugins.${pluginId}.default`,
		snippet: cfg.snippet,
		options: cfg.options,
	};
}
