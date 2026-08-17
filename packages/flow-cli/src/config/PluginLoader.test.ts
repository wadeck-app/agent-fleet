import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PluginLoader } from './PluginLoader.js';

// Resolve the real extension-points.json from the monorepo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// From packages/flow-cli/src/config/ → packages/extension-points/extension-points.json (3 up)
const REGISTRY_PATH = resolve(__dirname, '..', '..', '..', 'extension-points', 'extension-points.json');

const tmpBase = join(tmpdir(), `plugin-loader-test-${Date.now()}`);
let testCounter = 0;

function getTestDir(): string {
	return join(tmpBase, `t${++testCounter}`);
}

function makePluginPackage(
	packageDir: string,
	opts: {
		pluginId: string;
		manifestVersion?: string;
		extensionPoint: string;
		implName: string;
		version: number;
		providerFactory?: string;
	}
): void {
	mkdirSync(join(packageDir, 'src'), { recursive: true });
	const manifest = `
import type { PluginManifest } from 'extension-points';
export const manifest: PluginManifest = {
  pluginId: '${opts.pluginId}',
  manifestVersion: '${opts.manifestVersion ?? '1'}',
  implementations: {
    ${opts.extensionPoint}: {
      ${opts.implName}: {
        version: ${opts.version},
        provider: ${opts.providerFactory ?? '(opts) => ({ allocate: async () => ({ path: "/tmp", id: "x" }), release: async () => {} })'},
      },
    },
  },
};
`;
	writeFileSync(join(packageDir, 'plugin.config.ts'), manifest, 'utf8');

	// Write a compiled JS version as well for runtime loading
	const compiledManifest = `
export const manifest = {
  pluginId: '${opts.pluginId}',
  manifestVersion: '${opts.manifestVersion ?? '1'}',
  implementations: {
    ${opts.extensionPoint}: {
      ${opts.implName}: {
        version: ${opts.version},
        provider: ${opts.providerFactory ?? '(opts) => ({ allocate: async () => ({ path: "/tmp", id: "x" }), release: async () => {} })'},
      },
    },
  },
};
`;
	writeFileSync(join(packageDir, 'plugin.config.js'), compiledManifest, 'utf8');

	writeFileSync(
		join(packageDir, 'package.json'),
		JSON.stringify({
			name: `plugin-${opts.pluginId}`,
			type: 'module',
			exports: {
				'./plugin.config': { default: './plugin.config.js' },
			},
		}),
		'utf8'
	);
}

beforeEach(() => {
	mkdirSync(tmpBase, { recursive: true });
});

afterEach(() => {
	rmSync(tmpBase, { recursive: true, force: true });
});

describe('PluginLoader', () => {
	it('loads a valid workspace provider from plugin', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-none');
		makePluginPackage(pluginDir, {
			pluginId: 'none',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 1,
		});

		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		const provider = await loader.loadProvider('plugins.none.default', 'workspace', {});
		expect(provider).toBeDefined();
	});

	it('hard errors when pluginId in manifest does not match package name', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-none');
		makePluginPackage(pluginDir, {
			pluginId: 'wrong-id',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 1,
		});

		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.none.default', 'workspace', {})).rejects.toThrow(
			/pluginId.*mismatch|manifest.*pluginId/i
		);
	});

	it('hard errors when implementation not found in manifest', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-none');
		makePluginPackage(pluginDir, {
			pluginId: 'none',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 1,
		});

		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.none.nonexistent', 'workspace', {})).rejects.toThrow(
			/implementation.*not found|nonexistent/i
		);
	});

	it('hard errors when version is not supported', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-none');
		makePluginPackage(pluginDir, {
			pluginId: 'none',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 999,
		});

		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.none.default', 'workspace', {})).rejects.toThrow(
			/version.*not supported|unsupported.*version/i
		);
	});

	it('hard errors when manifest file does not exist', async () => {
		const d = getTestDir();
		mkdirSync(join(d, 'packages', 'plugin-none'), { recursive: true });
		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.none.default', 'workspace', {})).rejects.toThrow(
			/manifest.*not found|no.*manifest/i
		);
	});
});

describe('PluginLoader - L1: npm resolution (no pluginPackagesDir)', () => {
	it('resolves plugin-none via npm regardless of process.cwd()', async () => {
		const originalCwd = process.cwd();
		try {
			// Change cwd to tmpdir - if loader used process.cwd() it would fail
			process.chdir(tmpdir());
			const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
			const provider = await loader.loadProvider('plugins.none.default', 'workspace', {});
			expect(provider).toBeDefined();
		} finally {
			process.chdir(originalCwd);
		}
	});

	it('default pluginPackagesDir is not derived from process.cwd()', async () => {
		const originalCwd = process.cwd();
		// Construct what the old broken default would have been
		const brokenDefault = resolve(tmpdir(), 'packages');
		try {
			process.chdir(tmpdir());
			// If default were process.cwd()/packages it would point to brokenDefault, which doesn't exist
			// Using npm resolution should bypass this entirely
			const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
			// @ts-expect-error - accessing private field to verify it's not the cwd-based path
			expect(loader.pluginPackagesDir).not.toBe(brokenDefault);
		} finally {
			process.chdir(originalCwd);
		}
	});
});

describe('PluginLoader - L2: per-plugin pluginsDir override', () => {
	let l2TmpDir: string;

	beforeEach(() => {
		l2TmpDir = join(tmpdir(), `plugin-loader-l2-${Date.now()}`);
		mkdirSync(l2TmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(l2TmpDir, { recursive: true, force: true });
	});

	it('loads manifest from absolute pluginsDir when provided', async () => {
		const pluginDir = join(l2TmpDir, 'plugin-custom');
		makePluginPackage(pluginDir, {
			pluginId: 'custom',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 1,
		});
		const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
		expect(isAbsolute(l2TmpDir)).toBe(true);
		const provider = await loader.loadProvider('plugins.custom.default', 'workspace', {}, l2TmpDir);
		expect(provider).toBeDefined();
	});

	it('throws hard error when pluginsDir is a relative path', async () => {
		const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.custom.default', 'workspace', {}, 'relative/path')).rejects.toThrow(
			/pluginsDir must be an absolute path/i
		);
	});

	it('falls back to npm resolution when pluginsDir is not provided', async () => {
		const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
		// plugin-none is installed as npm dep - should resolve without pluginsDir
		const provider = await loader.loadProvider('plugins.none.default', 'workspace', {});
		expect(provider).toBeDefined();
	});

	it('resolves correctly when pluginsDir has a trailing slash', async () => {
		const pluginDir = join(l2TmpDir, 'plugin-custom');
		makePluginPackage(pluginDir, {
			pluginId: 'custom',
			extensionPoint: 'workspace',
			implName: 'default',
			version: 1,
		});
		const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
		// path.join normalizes trailing slash - must not throw
		const provider = await loader.loadProvider('plugins.custom.default', 'workspace', {}, l2TmpDir + '/');
		expect(provider).toBeDefined();
	});

	it('throws with a path hint when plugin.config.js is missing in custom pluginsDir', async () => {
		// l2TmpDir exists but has no plugin-missing subdirectory
		const loader = new PluginLoader({ registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.missing.default', 'workspace', {}, l2TmpDir)).rejects.toThrow(
			/plugin-missing/
		);
	});
});

describe('PluginLoader - JSON manifest', () => {
	function makeJsonPluginPackage(
		packageDir: string,
		opts: {
			pluginId: string;
			entrypoint?: string;
			exportName?: string;
			version?: number;
			writeEntrypoint?: boolean;
		}
	): void {
		mkdirSync(join(packageDir, 'dist'), { recursive: true });
		const entrypoint = opts.entrypoint ?? './dist/provider.js';
		const exportName = opts.exportName ?? 'provider';
		const json = {
			pluginId: opts.pluginId,
			manifestVersion: '1',
			implementations: {
				workspace: {
					default: {
						version: opts.version ?? 1,
						entrypoint,
						export: exportName,
					},
				},
			},
		};
		writeFileSync(join(packageDir, 'plugin.manifest.json'), JSON.stringify(json), 'utf8');
		if (opts.writeEntrypoint !== false) {
			writeFileSync(
				join(packageDir, 'dist', 'provider.js'),
				`export function provider() { return { allocate: async () => ({ path: '/tmp', id: 'json:test' }), release: async () => {} }; }`,
				'utf8'
			);
		}
	}

	it('loads a valid provider from JSON manifest entrypoint/export', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-json');
		makeJsonPluginPackage(pluginDir, { pluginId: 'json' });
		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		const provider = await loader.loadProvider('plugins.json.default', 'workspace', {});
		expect(provider).toBeDefined();
	});

	it('hard errors when entrypoint file does not exist', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-json');
		makeJsonPluginPackage(pluginDir, { pluginId: 'json', writeEntrypoint: false });
		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.json.default', 'workspace', {})).rejects.toThrow(
			/entrypoint.*does not exist/i
		);
	});

	it('hard errors when named export does not exist', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-json');
		makeJsonPluginPackage(pluginDir, { pluginId: 'json', exportName: 'nonExistentExport' });
		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.json.default', 'workspace', {})).rejects.toThrow(
			/does not export.*nonExistentExport|nonExistentExport.*function/i
		);
	});

	it('hard errors when entrypoint traverses outside package root', async () => {
		const d = getTestDir();
		const pluginDir = join(d, 'packages', 'plugin-json');
		mkdirSync(pluginDir, { recursive: true });
		const json = {
			pluginId: 'json',
			manifestVersion: '1',
			implementations: {
				workspace: {
					default: { version: 1, entrypoint: '../../evil.js', export: 'provider' },
				},
			},
		};
		writeFileSync(join(pluginDir, 'plugin.manifest.json'), JSON.stringify(json), 'utf8');
		const loader = new PluginLoader({ pluginPackagesDir: join(d, 'packages'), registryPath: REGISTRY_PATH });
		await expect(loader.loadProvider('plugins.json.default', 'workspace', {})).rejects.toThrow(
			/traverses outside/i
		);
	});
});
