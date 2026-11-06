import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests, registerBuiltinPlugin } from './BuiltinPluginRegistry';
import type { FlowPlugin } from './FlowPlugin';
import { PluginLoader } from './PluginLoader';
import { PluginProviderLoader } from './PluginProviderLoader';

interface Loadable {
	loadProvider: (
		typeRef: string,
		extensionPoint: string,
		options: Record<string, unknown>,
		pluginsDir?: string
	) => Promise<unknown>;
}

describe('PluginProviderLoader', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'plugin-provider-loader-'));
		__resetBuiltinPluginsForTests();
	});

	afterEach(() => {
		__resetBuiltinPluginsForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	// A legacy manifest plugin: plugin-<id>/plugin.config.js whose provider echoes the options it was built with.
	function writeLegacyPlugin(pluginId: string): void {
		const packageDir = join(dir, `plugin-${pluginId}`);
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, 'plugin.config.js'),
			`export const manifest = {
  pluginId: '${pluginId}',
  manifestVersion: '1',
  implementations: { workspace: { default: { version: 1, provider: (options) => ({ builtFrom: options }) } } },
};
`,
			'utf8'
		);
		writeFileSync(
			join(packageDir, 'package.json'),
			JSON.stringify({ name: `plugin-${pluginId}`, type: 'module' }),
			'utf8'
		);
	}

	// The same expectations run on the old loader alone (characterization: they hold before this change) and through
	// the new one (they must still hold).
	describe.each<[string, () => Loadable]>([
		['PluginLoader alone', () => new PluginLoader()],
		['through PluginProviderLoader', () => new PluginProviderLoader(new PluginLoader())],
	])('legacy manifest plugins, %s', (_name, makeLoader) => {
		it('loads a manifest plugin from an explicit pluginsDir and passes the options to its provider', async () => {
			writeLegacyPlugin('legacy');

			const provider = await makeLoader().loadProvider(
				'plugins.legacy.default',
				'workspace',
				{ baseDir: '/x' },
				dir
			);

			expect(provider).toEqual({ builtFrom: { baseDir: '/x' } });
		});

		it('loads a built-in manifest plugin when no directory is named', async () => {
			expect(await makeLoader().loadProvider('plugins.none.default', 'workspace', {})).toBeDefined();
		});

		it('keeps the legacy errors: unknown implementation, relative pluginsDir', async () => {
			writeLegacyPlugin('legacy');

			await expect(makeLoader().loadProvider('plugins.legacy.nope', 'workspace', {}, dir)).rejects.toThrow(
				/does not provide implementation "nope"/
			);
			await expect(
				makeLoader().loadProvider('plugins.legacy.default', 'workspace', {}, 'relative/dir')
			).rejects.toThrow(/pluginsDir must be an absolute path/);
			await expect(makeLoader().loadProvider('not-a-type-ref', 'workspace', {})).rejects.toThrow(
				/Invalid plugin type reference/
			);
		});
	});

	describe('registered plugins', () => {
		it('builds the instance of a plugin registered under the type reference, with the options', async () => {
			const instance = { dispose: async () => {} };
			const create = vi.fn(async () => instance);
			const plugin: FlowPlugin = { extensionPoint: 'worker-type', create };
			registerBuiltinPlugin('plugins.sandbox.default', plugin);
			const legacy = { loadProvider: vi.fn() };

			const built = await new PluginProviderLoader(legacy).loadProvider(
				'plugins.sandbox.default',
				'worker-type',
				{
					image: 'x',
				}
			);

			expect(built).toBe(instance);
			expect(create).toHaveBeenCalledWith({ image: 'x' });
			expect(legacy.loadProvider).not.toHaveBeenCalled();
		});

		it('fails when the registered plugin serves another extension point, naming both', async () => {
			registerBuiltinPlugin('plugins.sandbox.default', {
				extensionPoint: 'worker-type',
				create: async () => ({ dispose: async () => {} }),
			});

			await expect(
				new PluginProviderLoader({ loadProvider: vi.fn() }).loadProvider(
					'plugins.sandbox.default',
					'workspace',
					{}
				)
			).rejects.toThrow(/"plugins\.sandbox\.default".*"worker-type".*"workspace"/);
		});

		it.each([
			['nothing', undefined],
			['null', null],
			['an object without dispose', { run: () => {} }],
			['an object whose dispose is not a function', { dispose: 'later' }],
		])('fails at load time, naming the type reference, when create() returns %s', async (_label, returned) => {
			registerBuiltinPlugin('plugins.sandbox.default', {
				extensionPoint: 'worker-type',
				create: async () => returned as never,
			});

			await expect(
				new PluginProviderLoader({ loadProvider: vi.fn() }).loadProvider(
					'plugins.sandbox.default',
					'worker-type',
					{}
				)
			).rejects.toThrow(/"plugins.sandbox.default".*dispose/);
		});

		it('wraps a throw from create() with the type reference and keeps it as cause', async () => {
			const failure = new Error('docker is not running');
			registerBuiltinPlugin('plugins.sandbox.default', {
				extensionPoint: 'worker-type',
				create: async () => {
					throw failure;
				},
			});

			const error = await new PluginProviderLoader({ loadProvider: vi.fn() })
				.loadProvider('plugins.sandbox.default', 'worker-type', {})
				.then(
					() => undefined,
					(caught: unknown) => caught as Error
				);

			expect(error?.message).toMatch(/"plugins.sandbox.default".*docker is not running/);
			expect(error?.cause).toBe(failure);
		});

		// Was: "an explicit pluginsDir keeps meaning 'use that copy': the legacy path wins over the registry". The
		// precedence is now the same as WorkerTypeInstances: a registered built-in answers first, and says so loudly.
		it('a registered built-in answers ahead of an explicit pluginsDir, and says the directory is ignored', async () => {
			const create = vi.fn(async () => ({ dispose: async () => {} }));
			registerBuiltinPlugin('plugins.legacy.default', { extensionPoint: 'workspace', create });
			writeLegacyPlugin('legacy');
			const messages: { level: string; message: string }[] = [];
			const legacy = { loadProvider: vi.fn() };

			await new PluginProviderLoader(legacy, (level, message) => messages.push({ level, message })).loadProvider(
				'plugins.legacy.default',
				'workspace',
				{},
				dir
			);

			expect(create).toHaveBeenCalledOnce();
			expect(legacy.loadProvider).not.toHaveBeenCalled();
			expect(messages).toEqual([
				{
					level: 'warn',
					message:
						`plugin "plugins.legacy.default" is a built-in of flow, so it is served from the built-in registry and the pluginsDir "${dir}" you gave is ignored. ` +
						'To use a copy from that directory, give it another plugin id.',
				},
			]);
		});

		it('says the directory answered when nothing is registered under the reference', async () => {
			writeLegacyPlugin('legacy');
			const messages: { level: string; message: string }[] = [];

			const provider = await new PluginProviderLoader(new PluginLoader(), (level, message) =>
				messages.push({ level, message })
			).loadProvider('plugins.legacy.default', 'workspace', {}, dir);

			expect(provider).toEqual({ builtFrom: {} });
			expect(messages).toEqual([
				{
					level: 'warn',
					message: `plugin "plugins.legacy.default" is not a built-in of flow, so it is loaded from the pluginsDir "${dir}". A built-in registered under this reference later would take precedence over that directory.`,
				},
			]);
		});

		it('says nothing when no directory is named: there is no choice to report', async () => {
			const messages: string[] = [];

			await new PluginProviderLoader(new PluginLoader(), (_level, message) =>
				messages.push(message)
			).loadProvider('plugins.none.default', 'workspace', {});

			expect(messages).toEqual([]);
		});
	});
});
