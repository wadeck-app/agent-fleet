import { getBuiltinPlugin } from './BuiltinPluginRegistry';
import type { FlowPlugin } from './FlowPlugin';
import type { PluginLoader } from './PluginLoader';

/**
 * Loads the provider a `type: plugins.<id>.<impl>` entry names. The registry is asked first, under the type reference
 * itself, whether or not a pluginsDir is given -- the same precedence as WorkerTypeInstances: a built-in is the code
 * shipped with flow, and a same-named copy left in a directory (stale, or planted) must not silently replace it.
 * When nothing is registered, the manifest system answers, unchanged.
 *
 * With a pluginsDir the choice is never silent: it is reported at warn level whichever side answered.
 */
export class PluginProviderLoader {
	constructor(
		private readonly legacy: Pick<PluginLoader, 'loadProvider'>,
		/** Defaults to stderr: a precedence decision that nobody can see is the bug this guards against. */
		private readonly log: (level: 'warn', message: string) => void = (_level, message) => {
			process.stderr.write(`[flow] warning: ${message}\n`);
		}
	) {}

	async loadProvider(
		typeRef: string,
		extensionPoint: string,
		options: Record<string, unknown>,
		pluginsDir?: string
	): Promise<unknown> {
		const registered = getBuiltinPlugin(typeRef);
		if (registered === undefined) {
			if (pluginsDir !== undefined) {
				this.log(
					'warn',
					`plugin "${typeRef}" is not a built-in of flow, so it is loaded from the pluginsDir "${pluginsDir}". A built-in registered under this reference later would take precedence over that directory.`
				);
			}
			return this.legacy.loadProvider(typeRef, extensionPoint, options, pluginsDir);
		}
		if (registered.extensionPoint !== extensionPoint) {
			throw new Error(
				`Plugin "${typeRef}" serves the extension point "${registered.extensionPoint}", not "${extensionPoint}". ` +
					`Move it to a "${registered.extensionPoint}" entry of the configuration.`
			);
		}
		if (pluginsDir !== undefined) {
			this.log(
				'warn',
				`plugin "${typeRef}" is a built-in of flow, so it is served from the built-in registry and the pluginsDir "${pluginsDir}" you gave is ignored. To use a copy from that directory, give it another plugin id.`
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
