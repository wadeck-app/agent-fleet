import { getBuiltinPlugin } from './BuiltinPluginRegistry';
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
		return registered.create(options);
	}
}
