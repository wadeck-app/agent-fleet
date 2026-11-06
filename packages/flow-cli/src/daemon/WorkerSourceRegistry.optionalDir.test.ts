import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

let dir: string;
let pluginsDir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'worker-sources-optional-dir-'));
	pluginsDir = join(dir, 'plugins');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const declaration = (plugin: string, withDir: boolean) => ({
	sourceId: 'build-box',
	provider: 'relay',
	labels: [],
	maxWorkers: 1,
	plugin,
	...(withDir ? { pluginsDir } : {}),
});

describe('WorkerSourceRegistry - pluginsDir and a plugin ref (characterization)', () => {
	it('rejects a ref that is not a built-in without pluginsDir, with the exact fix', () => {
		expect(() => new WorkerSourceRegistry(dir).declare(declaration('sandbox.docker', false))).toThrow(
			'Worker source "build-box" names plugin "sandbox.docker" but no pluginsDir: the daemon would not know where to load it from. ' +
				'Pass --plugins-dir <absolute directory that contains plugin-<pluginId>/>.'
		);
	});

	it('keeps the directory of a built-in ref declared with one, and reads it back (an entry written before this change)', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare(declaration('relay.default', true));

		expect(new WorkerSourceRegistry(dir).find('build-box')).toMatchObject({
			plugin: 'relay.default',
			pluginsDir,
		});
	});

	it('rejects a relative pluginsDir even for a built-in ref', () => {
		expect(() =>
			new WorkerSourceRegistry(dir).declare({
				...declaration('relay.default', false),
				pluginsDir: 'relative/dir',
			})
		).toThrow(/pluginsDir must be an absolute path/);
	});
});

describe('WorkerSourceRegistry - a built-in ref needs no pluginsDir', () => {
	it('declares relay.default without a directory, stores none, and warns about nothing', () => {
		const { entry, warnings } = new WorkerSourceRegistry(dir).declare(declaration('relay.default', false));

		expect(entry.plugin).toBe('relay.default');
		expect(entry).not.toHaveProperty('pluginsDir');
		expect(warnings).toEqual([]);
	});

	it('accepts the type reference plugins.relay.default and stores the plain ref', () => {
		const { entry } = new WorkerSourceRegistry(dir).declare(declaration('plugins.relay.default', false));

		expect(entry.plugin).toBe('relay.default');
	});

	it('reads back an entry stored without a directory', () => {
		new WorkerSourceRegistry(dir).declare(declaration('relay.default', false));

		expect(new WorkerSourceRegistry(dir).list().map(entry => entry.plugin)).toEqual(['relay.default']);
	});

	it('still warns when a built-in ref is declared with a directory', () => {
		const { warnings } = new WorkerSourceRegistry(dir).declare(declaration('relay.default', true));

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('ignores the pluginsDir');
	});

	it('still rejects a ref that is not a built-in without a directory, also in the plugins.<ref> form', () => {
		expect(() => new WorkerSourceRegistry(dir).declare(declaration('plugins.sandbox.docker', false))).toThrow(
			'Worker source "build-box" names plugin "sandbox.docker" but no pluginsDir: the daemon would not know where to load it from. ' +
				'Pass --plugins-dir <absolute directory that contains plugin-<pluginId>/>.'
		);
	});
});
