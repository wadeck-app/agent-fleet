import { isAbsolute } from 'node:path';

import { findBuiltinWorkerType } from './BuiltinWorkerTypes.js';
import type { WorkerSourceDeclaration } from './WorkerSourceRegistry.js';

/**
 * `<pluginId>.<implName>`: plain names, because both become path segments below `pluginsDir` (`plugin-<pluginId>/`),
 * so no separator or dot may get through.
 */
export const PLUGIN_REF = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const TYPE_REFERENCE_PREFIX = 'plugins.';

/**
 * The rules a worker source's plugin reference (`plugin` + `pluginsDir`) must satisfy at declaration, and the plain form
 * it is stored in.
 *
 * The type reference `plugins.<pluginId>.<implName>` is understood only for a built-in worker type: for any other ref
 * the plain form is the only one, so its errors name what the user typed.
 */
export class WorkerSourcePluginReference {
	constructor(
		private readonly isBuiltin: (typeRef: string) => boolean = typeRef =>
			findBuiltinWorkerType(typeRef) !== undefined
	) {}

	/** Whether the ref, as typed, names a registered built-in worker type. An exact match: a typo is not a built-in. */
	isBuiltinRef(typed: string): boolean {
		return this.isBuiltin(`${TYPE_REFERENCE_PREFIX}${this.plain(typed)}`);
	}

	/** The declaration with its plugin in the plain form; unchanged unless a built-in was typed as `plugins.<ref>`. */
	normalize(declaration: WorkerSourceDeclaration): WorkerSourceDeclaration {
		const { plugin } = declaration;
		return plugin === undefined ? declaration : { ...declaration, plugin: this.plain(plugin) };
	}

	/**
	 * @throws when the plugin and the directory are inconsistent, naming the source and the fix: a plugin source that
	 *         cannot be loaded would otherwise only fail inside the daemon, where the person who declared it is not looking.
	 */
	validate(declaration: WorkerSourceDeclaration): void {
		const { sourceId, provider, plugin, pluginsDir } = declaration;
		if (plugin === undefined && pluginsDir === undefined) {
			return;
		}
		if (plugin === undefined) {
			throw new Error(
				`Worker source "${sourceId}" declares pluginsDir "${String(pluginsDir)}" without a plugin. ` +
					'Pass --plugin <pluginId>.<implName>, or drop --plugins-dir.'
			);
		}
		if (!PLUGIN_REF.test(this.plain(plugin))) {
			throw new Error(
				`Worker source "${sourceId}": plugin must be "<pluginId>.<implName>" (letters, digits, "_" and "-", one dot), got ${JSON.stringify(plugin)}.`
			);
		}
		if (provider.startsWith('built-in:')) {
			throw new Error(
				`Worker source "${sourceId}" names a plugin ("${plugin}") and the built-in provider "${provider}": a source is one or the other. ` +
					'Drop --plugin/--plugins-dir to use the built-in provider, or pass a free label as --provider (for example the plugin id) to use the plugin.'
			);
		}
		// A built-in is served from the registry, so it needs no directory; anything else is loaded from one.
		if (pluginsDir === undefined && !this.isBuiltinRef(plugin)) {
			throw new Error(
				`Worker source "${sourceId}" names plugin "${plugin}" but no pluginsDir: the daemon would not know where to load it from. ` +
					'Pass --plugins-dir <absolute directory that contains plugin-<pluginId>/>.'
			);
		}
		if (pluginsDir !== undefined && !isAbsolute(pluginsDir)) {
			throw new Error(
				`Worker source "${sourceId}": pluginsDir must be an absolute path, got "${pluginsDir}". ` +
					'The daemon runs from another directory, so a relative path would point somewhere else.'
			);
		}
	}

	/** The plain ref for a typed one: the `plugins.` prefix is dropped only when what remains is a registered built-in. */
	private plain(typed: string): string {
		if (!typed.startsWith(TYPE_REFERENCE_PREFIX)) {
			return typed;
		}
		const stripped = typed.slice(TYPE_REFERENCE_PREFIX.length);
		return PLUGIN_REF.test(stripped) && this.isBuiltin(typed) ? stripped : typed;
	}
}
