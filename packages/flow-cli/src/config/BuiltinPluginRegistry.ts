import { FLOW_PLUGIN_SHAPE, type FlowPlugin, isFlowPlugin } from './FlowPlugin';
import { PluginModuleLoader } from './PluginModuleLoader';
import { PluginRegistry } from './PluginRegistry';

const LABEL = 'flow';

// Module-level, as in queue's plugin-api: built-ins register themselves at startup and are resolved without an import,
// which is what a standalone bundle without node_modules needs.
const registry = new PluginRegistry<FlowPlugin>({ label: LABEL, isValid: isFlowPlugin, shape: FLOW_PLUGIN_SHAPE });
const loader = new PluginModuleLoader<FlowPlugin>({
	label: LABEL,
	registry,
	isValid: isFlowPlugin,
	shape: FLOW_PLUGIN_SHAPE,
});

/**
 * Registers a built-in plugin under `moduleName` and optional aliases. The identical object again is a no-op.
 * @throws when the plugin has the wrong shape or a name/alias belongs to a different plugin object
 */
export function registerBuiltinPlugin(moduleName: string, plugin: FlowPlugin, aliases: string[] = []): void {
	registry.register(moduleName, plugin, aliases);
}

/** Sorted names and aliases of the registered built-ins. */
export function listBuiltinPlugins(): string[] {
	return registry.list();
}

/** The registered built-in for a name or alias, without any import; undefined when there is none. */
export function getBuiltinPlugin(moduleName: string): FlowPlugin | undefined {
	return registry.lookup(moduleName);
}

/** TEST ONLY: empties the registry so a test does not see what another registered. */
export function __resetBuiltinPluginsForTests(): void {
	registry.clear();
}

/** Registry first (name or alias), else an import of an absolute path or a package; see PluginModuleLoader. */
export async function loadPlugin(moduleName: string): Promise<FlowPlugin> {
	return loader.load(moduleName);
}
