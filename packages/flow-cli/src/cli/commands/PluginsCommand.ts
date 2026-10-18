import { ConfigDir } from '@wadeck-app/shared-cli';
import type { Command } from 'commander';
import { FlowQueryService, UnknownPluginError } from 'flow-core';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { BUILTIN_PLUGIN_MANIFESTS } from '../../config/BuiltinPlugins.js';

// violations-suppress-end: ts/no-deep-relative

/** The plugins listed are the ones bundled in this CLI, so the service is given exactly those manifests. */
function createService(): FlowQueryService {
	return FlowQueryService.forConfigDir(ConfigDir.get('flow'), BUILTIN_PLUGIN_MANIFESTS);
}

export function registerPluginsCommand(program: Command): void {
	const plugins = program.command('plugins').description('List and inspect built-in plugins');

	plugins
		.command('list')
		.description('List all available built-in plugins')
		.option('--json', 'Output as JSON')
		.action((options: { json?: boolean }) => {
			const service = createService();
			if (options.json) {
				process.stdout.write(JSON.stringify(service.listPlugins(), null, 2) + '\n');
				return;
			}
			process.stdout.write(service.renderPluginTable() + '\n');
		});

	plugins
		.command('config <pluginId>')
		.description('Show configuration snippet for a plugin')
		.option('--json', 'Output as JSON')
		.action((pluginId: string, options: { json?: boolean }) => {
			try {
				const description = createService().describePlugin(pluginId);
				process.stdout.write(
					(options.json ? JSON.stringify(description, null, 2) : description.snippet) + '\n'
				);
			} catch (err) {
				if (!(err instanceof UnknownPluginError)) throw err;
				console.error(`Error: ${err.message}`);
				process.exit(1);
			}
		});
}
