import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

/**
 * A plugin ref that is a built-in worker type is served from the built-in registry, so the plugins directory the user
 * passes for it is ignored. The registry says so at declaration, not only in the daemon log.
 */

let dir: string;
let pluginsDir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'worker-sources-builtin-'));
	pluginsDir = mkdtempSync(join(tmpdir(), 'plugins-dir-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	rmSync(pluginsDir, { recursive: true, force: true });
});

const declaration = (plugin: string) => ({
	sourceId: 'build-box',
	provider: 'relay',
	labels: [],
	maxWorkers: 1,
	plugin,
	get pluginsDir() {
		return pluginsDir;
	},
});

describe('WorkerSourceRegistry - a plugin ref that is a built-in', () => {
	it('warns that the plugins directory is ignored, naming the source, the plugin and the directory', () => {
		const { warnings } = new WorkerSourceRegistry(dir).declare(declaration('relay.default'));

		expect(warnings).toEqual([
			`Worker source "build-box": plugin "relay.default" is a built-in worker type of flow, so the daemon serves it from the built-in registry and ignores the pluginsDir "${pluginsDir}". ` +
				'To use a copy from that directory instead, give it another plugin id.',
		]);
	});

	it('does not warn for a plugin that only exists on disk', () => {
		const { warnings } = new WorkerSourceRegistry(dir).declare(declaration('some-sandbox.default'));

		expect(warnings).toEqual([]);
	});

	it('still records the entry as declared: the warning is advice, not a refusal', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare(declaration('relay.default'));

		expect(registry.list().map(entry => [entry.plugin, entry.pluginsDir])).toEqual([['relay.default', pluginsDir]]);
	});

	it('does not warn for a source without a plugin', () => {
		const { warnings } = new WorkerSourceRegistry(dir).declare({
			sourceId: 'laptop',
			provider: 'built-in:inbound',
			labels: [],
			maxWorkers: 1,
		});

		expect(warnings).toEqual([]);
	});
});
