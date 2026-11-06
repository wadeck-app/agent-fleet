import { isAbsolute } from 'node:path';

import { ModuleImporter } from './ModuleImporter';
import type { PluginRegistry } from './PluginRegistry';

export interface PluginModuleLoaderOptions<TPlugin> {
	/** Names the loader in error messages, e.g. "flow". */
	label: string;
	registry: PluginRegistry<TPlugin>;
	isValid: (value: unknown) => value is TPlugin;
	/** Shape a valid plugin has, quoted in the error. */
	shape: string;
	/** Imports a bare package name. Defaults to `import()`; replaceable because the standalone bundle has no node_modules. */
	importPackage?: (packageName: string) => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRelativePath(moduleName: string): boolean {
	return (
		moduleName === '.' ||
		moduleName === '..' ||
		moduleName.startsWith('./') ||
		moduleName.startsWith('../') ||
		moduleName.startsWith('.\\') ||
		moduleName.startsWith('..\\')
	);
}

/**
 * Resolves a plugin module name: the registry first (exact name or alias), then an import. Copies the behavior of
 * queue's `loadPlugin`, generic over the plugin contract.
 */
export class PluginModuleLoader<TPlugin> {
	constructor(private readonly options: PluginModuleLoaderOptions<TPlugin>) {}

	/**
	 * @param moduleName a registered name or alias, an absolute path to a module file, or a package name
	 * @throws one error naming the module, with the original failure as `cause`, the built-ins and the fix
	 */
	async load(moduleName: string): Promise<TPlugin> {
		const registered = this.options.registry.lookup(moduleName);
		if (registered !== undefined) {
			return registered;
		}
		try {
			const mod = await this.importModule(moduleName);
			// Order of queue's loader: default export, then the named `plugin` export, then the module itself.
			const candidate = isRecord(mod) ? (mod['default'] ?? mod['plugin'] ?? mod) : mod;
			if (!this.options.isValid(candidate)) {
				throw new Error(
					`Module "${moduleName}" does not export a valid plugin ` +
						`(expected a default or "plugin" export, or the module itself, shaped ${this.options.shape}).`
				);
			}
			return candidate;
		} catch (error) {
			throw this.loadError(moduleName, error);
		}
	}

	private async importModule(moduleName: string): Promise<unknown> {
		if (isRelativePath(moduleName)) {
			throw new Error(
				`"${moduleName}" is a relative path, and plugin paths are never resolved against the working directory`
			);
		}
		if (isAbsolute(moduleName)) {
			return ModuleImporter.importFile(moduleName);
		}
		// Measured with this repo's bundle options (bundle, platform node, target node22, format cjs, external []): esbuild
		// leaves a non-literal import() untouched, so it is a real runtime ESM import. In the single-file bundle a bare name
		// therefore resolves from the directory of the bundle upward -- not from the cwd, not through NODE_PATH -- and fails
		// with ERR_MODULE_NOT_FOUND when no node_modules sits above the bundle. Only registered built-ins and absolute paths
		// work there. The experiment is described in the commit message that added this comment.
		const importPackage = this.options.importPackage ?? ((packageName: string) => import(packageName));
		return importPackage(moduleName);
	}

	private loadError(moduleName: string, cause: unknown): Error {
		const builtIns = this.options.registry.list();
		const reason = (cause instanceof Error ? cause.message : String(cause)).replace(/\.$/, '');
		const error = new Error(
			`Cannot load ${this.options.label} plugin module "${moduleName}": ${reason}. ` +
				`Built-in plugins: ${builtIns.length > 0 ? builtIns.join(', ') : 'none'}. ` +
				`For an external plugin, use an absolute path to the plugin entry file (relative paths are not supported); ` +
				`a package name only resolves where the package is installed next to flow-cli.`
		);
		error.cause = cause;
		return error;
	}
}
