import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

let dir: string;
let pluginsDir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'worker-sources-plugin-'));
	// Absolute, and on Windows it carries a drive letter.
	pluginsDir = join(dir, 'plugins');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const pluginDeclaration = () => ({
	sourceId: 'sandbox',
	provider: 'docker-sandbox',
	plugin: 'sandbox.docker',
	pluginsDir,
	labels: ['sandbox'],
	maxWorkers: 2,
});

describe('WorkerSourceRegistry - a plugin source', () => {
	it('stores the plugin ref and the plugins directory', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { entry } = registry.declare({ ...pluginDeclaration(), options: { image: 'node:22' } });

		expect(entry.plugin).toBe('sandbox.docker');
		expect(entry.pluginsDir).toBe(pluginsDir);
		expect(registry.find('sandbox')).toMatchObject({
			plugin: 'sandbox.docker',
			pluginsDir,
			options: { image: 'node:22' },
		});
	});

	it('rejects a plugin without pluginsDir, naming the source and the fix', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { pluginsDir: _omitted, ...withoutDir } = pluginDeclaration();

		expect(() => registry.declare(withoutDir)).toThrow(/source "sandbox".*plugin.*pluginsDir.*--plugins-dir/s);
		expect(registry.list()).toEqual([]);
	});

	it('rejects a pluginsDir without a plugin', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { plugin: _omitted, ...withoutPlugin } = pluginDeclaration();

		expect(() => registry.declare(withoutPlugin)).toThrow(/source "sandbox".*pluginsDir.*without a plugin/s);
	});

	it('rejects a relative pluginsDir', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...pluginDeclaration(), pluginsDir: 'plugins' })).toThrow(
			/pluginsDir must be an absolute path, got "plugins"/
		);
	});

	it('rejects a plugin ref together with a built-in provider', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...pluginDeclaration(), provider: 'built-in:command' })).toThrow(
			/source "sandbox".*built-in provider "built-in:command".*plugin/s
		);
	});

	it.each(['sandbox', 'sandbox.', '.docker', 'a.b.c', ' ', 'a/b.c', 'a\\b.c', '../x.y', 'a.b/c'])('rejects the malformed plugin ref %j', ref => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...pluginDeclaration(), plugin: ref })).toThrow(
			/plugin must be "<pluginId>\.<implName>"/
		);
	});

	it('still lets an unknown provider without a plugin be declared (it is refused when contacted)', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { pluginsDir: _a, plugin: _b, ...plain } = pluginDeclaration();

		expect(() => registry.declare(plain)).not.toThrow();
	});
});

describe('WorkerSourceRegistry - credentials in options', () => {
	it('rejects a literal credential, naming the source, and writes nothing', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...pluginDeclaration(), options: { token: 'abc123' } })).toThrow(
			/Literal credential value in worker source "sandbox" options: sensitive field "token"/
		);
		expect(registry.list()).toEqual([]);
	});

	it('accepts a ${ENV_VAR} reference and keeps it unresolved in the file', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare({ ...pluginDeclaration(), options: { token: '${SANDBOX_TOKEN}' } });

		expect(readFileSync(join(dir, 'worker-sources.json'), 'utf8')).toContain('${SANDBOX_TOKEN}');
	});

	it('also guards built-in sources', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() =>
			registry.declare({
				sourceId: 'cmd',
				provider: 'built-in:command',
				labels: [],
				maxWorkers: 1,
				options: { command: 'flow worker', password: 'hunter2' },
			})
		).toThrow(/Literal credential/);
	});
});

describe('WorkerSourceRegistry - removal notice', () => {
	it('tells the listener which source was removed', () => {
		const removed: string[] = [];
		const registry = new WorkerSourceRegistry(dir, id => removed.push(id));
		registry.declare(pluginDeclaration());

		registry.remove('sandbox');

		expect(removed).toEqual(['sandbox']);
	});

	it('does not tell it about a source that was never declared', () => {
		const removed: string[] = [];
		const registry = new WorkerSourceRegistry(dir, id => removed.push(id));

		expect(registry.remove('ghost')).toBe(false);
		expect(removed).toEqual([]);
	});

	it('tells it about the sources pruneDead drops', () => {
		const removed: string[] = [];
		const registry = new WorkerSourceRegistry(dir, id => removed.push(id));
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'gone',
						provider: 'built-in:inbound',
						labels: [],
						maxWorkers: 1,
						tokenHash: 'x',
						createdAt: '2026-01-01T00:00:00.000Z',
						pid: 2 ** 22 + 12345,
					},
				],
			})
		);

		expect(registry.pruneDead()).toEqual(['gone']);
		expect(removed).toEqual(['gone']);
	});
});
