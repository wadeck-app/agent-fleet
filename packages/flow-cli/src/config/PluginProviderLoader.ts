import { getBuiltinPlugin } from './BuiltinPluginRegistry';
import type { FlowPlugin } from './FlowPlugin';
import type { PluginLoader } from './PluginLoader';

/**
 * Loads the provider a `type: plugins.<id>.<impl>` entry names. The registry is asked first, under the type reference
 * itself; when nothing is registered there (always the case today: no builtin is migrated), the manifest system answers,
 * unchanged. An explicit pluginsDir keeps its meaning "use that copy" and skips the registry, like it skips the
 * built-in manifests.
 */
export class PluginProviderLoader {
	constructor(private readonly legacy: Pick<PluginLoader, 'loadProvider'>) {}

	async loadProvider(
		typeRef: string,
		extensionPoint: string,
		options: Record<string, unknown>,
		pluginsDir?: string
	): Promise<unknown> {
		const registered = pluginsDir === undefined ? getBuiltinPlugin(typeRef) : undefined;
		if (registered === undefined) {
			return this.legacy.loadProvider(typeRef, extensionPoint, options, pluginsDir);
		}
		if (registered.extensionPoint !== extensionPoint) {
			throw new Error(
				`Plugin "${typeRef}" serves the extension point "${registered.extensionPoint}", not "${extensionPoint}". ` +
					`Move it to a "${registered.extensionPoint}" entry of the configuration.`
			);
		}
		return this.createInstance(typeRef, registered, options);
	}

	// Checked here, at load time: a missing dispose would otherwise only surface at teardown, when nothing can be fixed.
	private async createInstance(
		typeRef: string,
		plugin: FlowPlugin,
		options: Record<string, unknown>
	): Promise<unknown> {
		let instance: unknown;
		try {
			instance = await plugin.create(options);
		} catch (cause) {
			const reason = cause instanceof Error ? cause.message : String(cause);
			const error = new Error(`Plugin "${typeRef}" failed to create its instance: ${reason}`);
			error.cause = cause;
			throw error;
		}
		if (
			typeof instance !== 'object' ||
			instance === null ||
			typeof (instance as { dispose?: unknown }).dispose !== 'function'
		) {
			throw new Error(
				`Plugin "${typeRef}" create() must return an object with a "dispose" function (the owner calls it at teardown), ` +
					`got ${instance === null ? 'null' : typeof instance === 'object' ? 'an object without dispose' : typeof instance}.`
			);
		}
		return instance;
	}
}
