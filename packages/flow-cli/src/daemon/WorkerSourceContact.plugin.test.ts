import { beforeEach, describe, expect, it } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let fixture: WorkerTypeFixtureState;
let reported: string[];
let workerTypes: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	reported = [];
	workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
});

const pluginEntry = (sourceId: string, overrides: Partial<WorkerSourceEntry> = {}): WorkerSourceEntry => ({
	sourceId,
	provider: 'fixture',
	plugin: 'fixture-sandbox.sandbox',
	pluginsDir: FIXTURE_PLUGINS_DIR,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'x',
	createdAt: '2026-10-27T00:00:00.000Z',
	...overrides,
});

const contact = (entries: WorkerSourceEntry[], dependencies: Parameters<typeof contactDeclaredSources>[3] = {}) =>
	contactDeclaredSources(entries, 'ws://127.0.0.1:1', message => reported.push(message), dependencies);

describe('contactDeclaredSources - plugin sources', () => {
	it('asks the plugin instance for a worker, with no project (the daemon passes none)', async () => {
		await contact([pluginEntry('sandbox')], { workerTypes });

		expect(reported).toEqual([]);
		expect(fixture.obtained).toEqual([
			{ sourceId: 'sandbox', request: { daemonEndpoint: 'ws://127.0.0.1:1', sourceId: 'sandbox', projects: [] } },
		]);
	});

	it('does not rebuild the provider on the next contact', async () => {
		await contact([pluginEntry('sandbox')], { workerTypes });
		await contact([pluginEntry('sandbox')], { workerTypes });

		expect(fixture.created).toHaveLength(1);
		expect(fixture.obtained).toHaveLength(2);
	});

	it('reports a plugin that cannot be loaded by source, plugin and fix, and still contacts the others', async () => {
		await contact(
			[pluginEntry('broken', { plugin: 'fixture-sandbox.throws' }), pluginEntry('fine')],
			{ workerTypes }
		);

		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain('could not obtain a worker from source "broken"');
		expect(reported[0]).toContain('"fixture-sandbox.throws"');
		expect(reported[0]).toContain('Fix:');
		expect(fixture.obtained.map(o => o.sourceId)).toEqual(['fine']);
	});

	it('reports a plugin source met by a daemon that cannot load plugins as a wiring mistake, not an unknown provider', async () => {
		await contact([pluginEntry('sandbox')]);

		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain('source "sandbox"');
		expect(reported[0]).toMatch(/plugin.*wiring|report it/i);
		expect(reported[0]).not.toContain('unknown worker source provider');
	});

	it('still reports an unknown provider that has no plugin', async () => {
		const { plugin: _plugin, pluginsDir: _dir, ...plain } = pluginEntry('weird', { provider: 'nope' });

		await contact([plain], { workerTypes });

		expect(reported.join(' ')).toContain('unknown worker source provider "nope"');
	});
});
