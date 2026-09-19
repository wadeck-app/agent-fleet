import type { Command } from 'commander';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { BUILTIN_PLUGIN_MANIFESTS } from '../../config/BuiltinPlugins.js';
// violations-suppress-end: ts/no-deep-relative

interface PluginEntry {
	id: string;
	extensionPoint: string;
	typeString: string;
}

interface PluginConfig {
	extensionPoint: string;
	snippet: string;
	options: Record<string, string>;
}

function buildPluginList(): PluginEntry[] {
	const entries: PluginEntry[] = [];
	for (const manifest of Object.values(BUILTIN_PLUGIN_MANIFESTS)) {
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

export function registerPluginsCommand(program: Command): void {
	const plugins = program.command('plugins').description('List and inspect built-in plugins');

	plugins
		.command('list')
		.description('List all available built-in plugins')
		.option('--json', 'Output as JSON')
		.action((options: { json?: boolean }) => {
			const entries = buildPluginList();
			if (options.json) {
				process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
				return;
			}
			const id = 'ID'.padEnd(18);
			const ext = 'EXTENSION'.padEnd(14);
			const header = `${id}${ext}TYPE STRING`;
			const rows = entries.map(e => `${e.id.padEnd(18)}${e.extensionPoint.padEnd(14)}${e.typeString}`);
			process.stdout.write([header, ...rows].join('\n') + '\n');
		});

	plugins
		.command('config <pluginId>')
		.description('Show configuration snippet for a plugin')
		.option('--json', 'Output as JSON')
		.action((pluginId: string, options: { json?: boolean }) => {
			const cfg = PLUGIN_CONFIGS[pluginId];
			if (cfg === undefined) {
				console.error(
					`Error: unknown plugin '${pluginId}'. Run 'flow plugins list' to see available plugins.`
				);
				process.exit(1);
			}
			if (options.json) {
				const entries = buildPluginList();
				const entry = entries.find(e => e.id === pluginId);
				process.stdout.write(
					JSON.stringify(
						{
							id: pluginId,
							extensionPoint: cfg.extensionPoint,
							typeString: entry?.typeString ?? `plugins.${pluginId}.default`,
							snippet: cfg.snippet,
							options: cfg.options,
						},
						null,
						2
					) + '\n'
				);
				return;
			}
			process.stdout.write(cfg.snippet + '\n');
		});
}
