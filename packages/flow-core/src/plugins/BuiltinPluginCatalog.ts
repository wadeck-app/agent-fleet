import type { PluginCatalogSource } from './PluginCatalog.js';

function source(pluginId: string, extensionPoint: string): PluginCatalogSource {
	return { pluginId, implementations: { [extensionPoint]: { default: {} } } };
}

/**
 * Which plugins flow ships, by id, extension point and implementation name: what `flow plugins list` and the
 * app-module need, without the plugin code. Same order as flow-cli's BUILTIN_PLUGIN_MANIFESTS, which is the
 * order of the listing.
 *
 * Accepted exception to "one definition": the real manifests (each plugin package's plugin.config) import the
 * implementations, and through them execa and its dependencies, which an app-module bundle must not embed;
 * and the plugin packages expose no metadata-only entry to read the ids from. So the four ids and extension
 * points are written here and in flow-cli, and flow-cli's BuiltinPlugins.test.ts pins both lists together:
 * a plugin added or renamed in one fails that test until the other is updated.
 */
export const BUILTIN_PLUGIN_CATALOG: Record<string, PluginCatalogSource> = {
	none: source('none', 'workspace'),
	'cli-approval': source('cli-approval', 'approval'),
	'file-approval': source('file-approval', 'approval'),
	worktree: source('worktree', 'workspace'),
};
