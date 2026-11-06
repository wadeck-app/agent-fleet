import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FLOW_PLUGIN_SHAPE, type FlowPlugin, isFlowPlugin } from './FlowPlugin';
import { PluginModuleLoader } from './PluginModuleLoader';
import { PluginRegistry } from './PluginRegistry';

function makePlugin(extensionPoint = 'worker-type'): FlowPlugin {
	return { extensionPoint, create: async () => ({ dispose: async () => {} }) };
}

const VALID = "{ extensionPoint: 'worker-type', create: async () => ({ dispose: async () => {} }) }";

describe('PluginModuleLoader', () => {
	let dir: string;
	let registry: PluginRegistry<FlowPlugin>;
	let importedPackages: string[];
	let packages: Record<string, unknown>;
	let loader: PluginModuleLoader<FlowPlugin>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'plugin-module-loader-'));
		registry = new PluginRegistry<FlowPlugin>({ label: 'flow', isValid: isFlowPlugin, shape: FLOW_PLUGIN_SHAPE });
		importedPackages = [];
		packages = {};
		loader = new PluginModuleLoader<FlowPlugin>({
			label: 'flow',
			registry,
			isValid: isFlowPlugin,
			shape: FLOW_PLUGIN_SHAPE,
			importPackage: async name => {
				importedPackages.push(name);
				if (!(name in packages)) {
					throw Object.assign(new Error(`Cannot find package '${name}'`), { code: 'ERR_MODULE_NOT_FOUND' });
				}
				return packages[name];
			},
		});
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function writeModule(name: string, source: string): string {
		const file = join(dir, name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(file, source, 'utf8');
		return file;
	}

	async function failureOf(moduleName: string): Promise<Error> {
		try {
			await loader.load(moduleName);
		} catch (error) {
			return error as Error;
		}
		throw new Error(`expected load("${moduleName}") to fail`);
	}

	describe('registry first', () => {
		it('returns the registered plugin for its name, without importing anything', async () => {
			const plugin = makePlugin();
			registry.register('sandbox', plugin);

			expect(await loader.load('sandbox')).toBe(plugin);
			expect(importedPackages).toEqual([]);
		});

		it('returns the registered plugin for an alias', async () => {
			const plugin = makePlugin();
			registry.register('sandbox', plugin, ['docker']);

			expect(await loader.load('docker')).toBe(plugin);
		});

		it('prefers the registry over a file of the same name', async () => {
			const file = writeModule('shadow.mjs', `export default ${VALID};`);
			const plugin = makePlugin('registered');
			registry.register(file, plugin);

			expect(await loader.load(file)).toBe(plugin);
		});
	});

	describe('export forms of an imported module', () => {
		it('accepts the default export', async () => {
			const file = writeModule('default.mjs', `export default ${VALID};`);

			expect((await loader.load(file)).extensionPoint).toBe('worker-type');
		});

		it('accepts a named "plugin" export', async () => {
			const file = writeModule('named.mjs', `export const plugin = ${VALID};`);

			expect((await loader.load(file)).extensionPoint).toBe('worker-type');
		});

		it('accepts the module itself', async () => {
			const file = writeModule(
				'itself.mjs',
				"export const extensionPoint = 'worker-type'; export async function create() { return { dispose: async () => {} }; }"
			);

			expect((await loader.load(file)).extensionPoint).toBe('worker-type');
		});

		it('prefers default over the named export', async () => {
			const file = writeModule(
				'both.mjs',
				`export default { extensionPoint: 'from-default', create: async () => ({}) }; export const plugin = ${VALID};`
			);

			expect((await loader.load(file)).extensionPoint).toBe('from-default');
		});

		it('imports a bare package name through importPackage', async () => {
			packages['flow-plugin-x'] = { default: makePlugin('from-package') };

			expect((await loader.load('flow-plugin-x')).extensionPoint).toBe('from-package');
			expect(importedPackages).toEqual(['flow-plugin-x']);
		});
	});

	describe('loading from an absolute path', () => {
		it('works with the path of this platform (a drive letter on Windows)', async () => {
			const file = writeModule('absolute.mjs', `export default ${VALID};`);
			if (process.platform === 'win32') {
				expect(file).toMatch(/^[A-Za-z]:[\\/]/);
			}

			expect((await loader.load(file)).extensionPoint).toBe('worker-type');
		});

		it('rejects a relative path with the fix, and imports nothing', async () => {
			for (const relative of ['./plugin.mjs', '../plugin.mjs', '.\\plugin.mjs']) {
				const error = await failureOf(relative);

				expect(error.message).toContain(`"${relative}"`);
				expect(error.message).toMatch(/relative/);
				expect(error.message).toMatch(/absolute path/);
			}
			expect(importedPackages).toEqual([]);
		});
	});

	describe('the load error', () => {
		it('names the module, keeps the import failure as cause, lists the sorted built-ins and gives the fix', async () => {
			registry.register('zeta', makePlugin(), ['alpha-alias']);
			registry.register('beta', makePlugin());
			const missing = join(dir, 'missing.mjs');

			const error = await failureOf(missing);

			expect(error.message).toMatch(/^Cannot load flow plugin module ".*missing\.mjs": /);
			expect(error.message).toContain('Built-in plugins: alpha-alias, beta, zeta.');
			expect(error.message).toMatch(/absolute path to the plugin entry file/);
			expect(error.cause).toBeInstanceOf(Error);
			expect((error.cause as NodeJS.ErrnoException).code).toBe('ERR_MODULE_NOT_FOUND');
			expect(error.message).toContain((error.cause as Error).message);
		});

		it('says "none" when nothing is registered', async () => {
			const error = await failureOf('flow-plugin-missing');

			expect(error.message).toContain('Built-in plugins: none.');
			expect(error.cause).toBeInstanceOf(Error);
		});

		it('names the expected shape when the module exports something else', async () => {
			const file = writeModule('wrong.mjs', 'export default { nope: 1 };');

			const error = await failureOf(file);

			expect(error.message).toContain(FLOW_PLUGIN_SHAPE);
			expect(error.message).toMatch(/does not export a valid plugin/);
			expect((error.cause as Error).message).toContain(FLOW_PLUGIN_SHAPE);
		});

		it('keeps a syntax error of the module as cause', async () => {
			const file = writeModule('broken.mjs', 'export default {{{');

			const error = await failureOf(file);

			// (vitest's transform rewrites the error class, so only the identity and the message are asserted)
			expect(error.cause).toBeInstanceOf(Error);
			expect(error.message).toContain((error.cause as Error).message.replace(/\.$/, ''));
		});
	});
});
