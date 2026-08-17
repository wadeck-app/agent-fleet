import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface ExtensionPointVersion {
	version: number;
	status: string;
}

interface ExtensionPointEntry {
	id: string;
	versions: ExtensionPointVersion[];
}

interface ExtensionPointsRegistry {
	extensionPoints: ExtensionPointEntry[];
}

interface PluginImplementation {
	version?: number;
	provider?: (options: unknown) => unknown;
	entrypoint?: string;
	export?: string;
}

interface PluginManifest {
	pluginId: string;
	manifestVersion: string;
	implementations: Record<string, Record<string, PluginImplementation>>;
}

interface PluginLoaderOptions {
	pluginPackagesDir?: string;
	registryPath?: string;
}

function loadRegistry(registryPath: string): ExtensionPointsRegistry {
	try {
		const content = readFileSync(registryPath, 'utf8');
		return JSON.parse(content) as ExtensionPointsRegistry;
	} catch {
		throw new Error(`Failed to load extension-points registry from "${registryPath}"`);
	}
}

function parseTypeRef(typeRef: string): { pluginId: string; implName: string } {
	// Format: plugins.<pluginId>.<implName>
	const match = typeRef.match(/^plugins\.([^.]+)\.([^.]+)$/);
	if (!match) {
		throw new Error(`Invalid plugin type reference "${typeRef}". Expected format: plugins.<pluginId>.<implName>`);
	}
	return { pluginId: match[1]!, implName: match[2]! };
}

// Scoped to flow-cli's own node_modules regardless of user's CWD
const _require = createRequire(import.meta.url);

export class PluginLoader {
	private pluginPackagesDir: string | undefined;
	private registryPath: string;
	private registryCache: ExtensionPointsRegistry | null = null;

	constructor(options: PluginLoaderOptions = {}) {
		this.pluginPackagesDir = options.pluginPackagesDir;
		if (options.registryPath) {
			this.registryPath = options.registryPath;
		} else {
			// Resolve registry via npm - extension-points is a dep of flow-cli
			this.registryPath = _require.resolve('extension-points/extension-points.json');
		}
	}

	async loadProvider(
		typeRef: string,
		extensionPoint: string,
		options: Record<string, unknown>,
		pluginsDir?: string
	): Promise<unknown> {
		const { pluginId, implName } = parseTypeRef(typeRef);

		const manifest = await this.loadManifest(pluginId, pluginsDir);

		// PLUGIN-002 runtime enforcement: pluginId must match
		if (manifest.pluginId !== pluginId) {
			throw new Error(
				`Plugin manifest pluginId mismatch: manifest declares "${manifest.pluginId}" but expected "${pluginId}"`
			);
		}

		// Look up the implementation
		const extPointImpls = manifest.implementations[extensionPoint];
		if (!extPointImpls) {
			throw new Error(
				`Plugin "${pluginId}" does not provide any implementation for extension point "${extensionPoint}"`
			);
		}

		const impl = extPointImpls[implName];
		if (!impl) {
			throw new Error(
				`Plugin "${pluginId}" does not provide implementation "${implName}" for extension point "${extensionPoint}"`
			);
		}

		// Version is required - absent = hard error (spec: version field is required)
		if (impl.version === undefined) {
			throw new Error(
				`Plugin "${pluginId}" implementation "${implName}" for extension point "${extensionPoint}" is missing the required "version" field`
			);
		}
		this.assertVersionSupported(extensionPoint, impl.version);

		// TS manifest path: provider factory
		if (impl.provider) {
			return impl.provider(options);
		}

		// JSON manifest path: entrypoint + export
		if (impl.entrypoint !== undefined) {
			const pluginDir = await this.resolvePluginDir(pluginId, pluginsDir);
			const resolvedEntrypoint = resolve(pluginDir, impl.entrypoint);
			const rel = relative(pluginDir, resolvedEntrypoint);
			if (rel.startsWith('..') || resolve(rel) === rel) {
				throw new Error(
					`Plugin "${pluginId}" entrypoint "${impl.entrypoint}" traverses outside the package root`
				);
			}
			const exists = await access(resolvedEntrypoint)
				.then(() => true)
				.catch(() => false);
			if (!exists) {
				throw new Error(`Plugin "${pluginId}" entrypoint file "${resolvedEntrypoint}" does not exist`);
			}
			const exportName = impl.export;
			if (!exportName) {
				throw new Error(`Plugin "${pluginId}" JSON manifest has "entrypoint" but no "export" field`);
			}
			const moduleUrl = pathToFileURL(resolvedEntrypoint).href;
			const mod = (await import(moduleUrl)) as Record<string, unknown>;
			const factory = mod[exportName];
			if (typeof factory !== 'function') {
				throw new Error(`Plugin "${pluginId}" entrypoint does not export "${exportName}" as a function`);
			}
			return factory(options);
		}

		throw new Error(
			`Plugin "${pluginId}" implementation "${implName}" has no provider factory or entrypoint/export`
		);
	}

	private async loadManifest(pluginId: string, pluginsDir?: string): Promise<PluginManifest> {
		const pluginDir = await this.resolvePluginDir(pluginId, pluginsDir);
		const jsManifestPath = join(pluginDir, 'plugin.config.js');
		const jsonManifestPath = join(pluginDir, 'plugin.manifest.json');

		const hasJsManifest = await access(jsManifestPath)
			.then(() => true)
			.catch(() => false);

		if (hasJsManifest) {
			const moduleUrl = pathToFileURL(jsManifestPath).href;
			const mod = (await import(moduleUrl)) as Record<string, unknown>;
			const manifest = (mod['manifest'] ?? mod['default']) as PluginManifest | undefined;
			if (!manifest || typeof manifest !== 'object') {
				throw new Error(
					`Plugin "${pluginId}" manifest at "${jsManifestPath}" did not export a "manifest" object`
				);
			}
			return manifest;
		}

		const hasJsonManifest = await access(jsonManifestPath)
			.then(() => true)
			.catch(() => false);

		if (hasJsonManifest) {
			const content = readFileSync(jsonManifestPath, 'utf8');
			return JSON.parse(content) as PluginManifest;
		}

		throw new Error(
			`No manifest found for plugin "${pluginId}". Expected "${jsManifestPath}" or "${jsonManifestPath}"`
		);
	}

	private async resolvePluginDir(pluginId: string, pluginsDir?: string): Promise<string> {
		// L2: explicit pluginsDir override - must be absolute
		if (pluginsDir !== undefined) {
			if (!isAbsolute(pluginsDir)) {
				throw new Error(`pluginsDir must be an absolute path, got: "${pluginsDir}"`);
			}
			return join(pluginsDir, `plugin-${pluginId}`);
		}

		// Test/explicit override via constructor
		if (this.pluginPackagesDir !== undefined) {
			return join(this.pluginPackagesDir, `plugin-${pluginId}`);
		}

		// L1: npm resolution - scoped to flow-cli's own node_modules
		try {
			const manifestExportPath = _require.resolve(`plugin-${pluginId}/plugin.config`);
			// manifestExportPath is the plugin.config.js file; its directory is the plugin root
			return join(manifestExportPath, '..');
		} catch {
			throw new Error(
				`No manifest found for plugin "${pluginId}". ` +
					`Ensure "plugin-${pluginId}" is installed as a dependency of flow-cli.`
			);
		}
	}

	private assertVersionSupported(extensionPoint: string, version: number): void {
		if (!this.registryCache) {
			this.registryCache = loadRegistry(this.registryPath);
		}
		const registry = this.registryCache;
		const epEntry = registry.extensionPoints.find(ep => ep.id === extensionPoint);
		if (!epEntry) {
			throw new Error(`Extension point "${extensionPoint}" is not registered in extension-points.json`);
		}

		const supported = epEntry.versions.map(v => v.version);
		if (!supported.includes(version)) {
			throw new Error(
				`Version ${version} for extension point "${extensionPoint}" is not supported. Supported: [${supported.join(', ')}]`
			);
		}
	}
}
