import type { PluginCatalogSource } from './PluginCatalog.js';

function source(pluginId: string, extensionPoint: string): PluginCatalogSource {
	return { pluginId, implementations: { [extensionPoint]: { default: {} } } };
}

/**
 * Which plugins flow ships, by id, extension point and implementation name: what `flow plugins list` and the
 * app-module need, without the plugin code. Same order as BUILTIN_PLUGIN_MANIFESTS, which is the order of the
 * listing. The real manifests (flow-cli's BUILTIN_PLUGIN_MANIFESTS) import
 * the implementations, and through them execa and its dependencies; a host that only lists plugins should not
 * bundle those. flow-cli's BuiltinPlugins.test.ts pins this list to the real manifests, so a plugin added or
 * renamed there fails that test until this is updated.
 */
export const BUILTIN_PLUGIN_CATALOG: Record<string, PluginCatalogSource> = {
	none: source('none', 'workspace'),
	'cli-approval': source('cli-approval', 'approval'),
	'file-approval': source('file-approval', 'approval'),
	worktree: source('worktree', 'workspace'),
};
