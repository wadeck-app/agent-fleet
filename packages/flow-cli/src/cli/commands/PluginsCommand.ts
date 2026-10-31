import type { Command } from 'commander';
import { FlowQueryService, UnknownPluginError } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { BUILTIN_PLUGIN_MANIFESTS } from '../../config/BuiltinPlugins.js';
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { formatCliError } from './CliErrorOutput';

// violations-suppress-end: ts/no-deep-relative

/** The plugins listed are the ones bundled in this CLI, so the service is given exactly those manifests. */
function createService(): FlowQueryService {
	return FlowQueryService.forConfigDir(flowConfigDir(), BUILTIN_PLUGIN_MANIFESTS);
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
				if (!(err instanceof UnknownPluginError)) {
					throw err;
				}
				const message = normalizeError(err).message;
				console.error(formatCliError(message));
				process.exit(1);
			}
		});
}
