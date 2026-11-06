import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	__resetBuiltinPluginsForTests,
	getBuiltinPlugin,
	listBuiltinPlugins,
	loadPlugin,
	registerBuiltinPlugin,
} from './BuiltinPluginRegistry';
import type { FlowPlugin } from './FlowPlugin';

function makePlugin(): FlowPlugin {
	return { extensionPoint: 'worker-type', create: async () => ({ dispose: async () => {} }) };
}

describe('built-in plugin registry (module level)', () => {
	beforeEach(() => {
		__resetBuiltinPluginsForTests();
	});

	afterEach(() => {
		__resetBuiltinPluginsForTests();
	});

	it('registers, lists sorted and loads by name and by alias', async () => {
		const plugin = makePlugin();
		registerBuiltinPlugin('sandbox', plugin, ['docker']);

		expect(listBuiltinPlugins()).toEqual(['docker', 'sandbox']);
		expect(await loadPlugin('sandbox')).toBe(plugin);
		expect(await loadPlugin('docker')).toBe(plugin);
	});

	it('getBuiltinPlugin answers by name or alias without any import, undefined when unknown', () => {
		const plugin = makePlugin();
		registerBuiltinPlugin('sandbox', plugin, ['docker']);

		expect(getBuiltinPlugin('docker')).toBe(plugin);
		expect(getBuiltinPlugin('./not-imported.mjs')).toBeUndefined();
	});

	it('is a no-op for the identical object and throws for a different one', () => {
		const plugin = makePlugin();
		registerBuiltinPlugin('sandbox', plugin);

		expect(() => registerBuiltinPlugin('sandbox', plugin)).not.toThrow();
		expect(() => registerBuiltinPlugin('sandbox', makePlugin())).toThrow(/"sandbox".*already registered/);
	});

	it('validates the flow plugin shape at registration', () => {
		expect(() => registerBuiltinPlugin('bad', {} as unknown as FlowPlugin)).toThrow(
			/"bad".*extensionPoint: string, create: function/
		);
	});

	it('the test-only reset isolates tests from each other', () => {
		registerBuiltinPlugin('sandbox', makePlugin());
		__resetBuiltinPluginsForTests();

		expect(listBuiltinPlugins()).toEqual([]);
		expect(() => registerBuiltinPlugin('sandbox', makePlugin())).not.toThrow();
	});

	it('the reset refuses to run outside a test run, naming the variables it checked', () => {
		vi.stubEnv('VITEST', '');
		vi.stubEnv('NODE_ENV', 'production');
		try {
			expect(() => __resetBuiltinPluginsForTests()).toThrow(/test-only.*VITEST.*NODE_ENV/);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	describe('loadPlugin falls back to import', () => {
		let dir: string;

		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), 'builtin-registry-'));
		});

		afterEach(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		it('imports an absolute path and lists the built-ins when it fails', async () => {
			registerBuiltinPlugin('sandbox', makePlugin());
			const file = join(dir, 'external.mjs');
			writeFileSync(
				file,
				"export default { extensionPoint: 'external', create: async () => ({ dispose: async () => {} }) };",
				'utf8'
			);

			expect((await loadPlugin(file)).extensionPoint).toBe('external');
			await expect(loadPlugin(join(dir, 'missing.mjs'))).rejects.toThrow(/Built-in plugins: sandbox\./);
		});
	});
});
