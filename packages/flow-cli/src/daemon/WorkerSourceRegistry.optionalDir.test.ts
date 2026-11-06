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
