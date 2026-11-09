import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
	// A plugin from disk is given a launch credential per ask, so the daemon must be able to mint one (without an
	// issuer the ask fails: see LaunchCredentialRevocation.test.ts).
	contactDeclaredSources(entries, 'ws://127.0.0.1:1', message => reported.push(message), {
		issueLaunchToken: () => 'minted',
		...dependencies,
	});

describe('contactDeclaredSources - plugin sources', () => {
	it('asks the plugin instance for a worker, with no project (the daemon passes none)', async () => {
		await contact([pluginEntry('sandbox')], { workerTypes });

		expect(reported).toEqual([]);
		expect(fixture.obtained).toEqual([
			{
				sourceId: 'sandbox',
				request: { daemonEndpoint: 'ws://127.0.0.1:1', sourceId: 'sandbox', projects: [], authToken: 'minted' },
			},
		]);
	});

	it('does not rebuild the provider on the next contact', async () => {
		await contact([pluginEntry('sandbox')], { workerTypes });
		await contact([pluginEntry('sandbox')], { workerTypes });

		expect(fixture.created).toHaveLength(1);
		expect(fixture.obtained).toHaveLength(2);
	});

	it('reports a plugin that cannot be loaded by source, plugin and fix, and still contacts the others', async () => {
		await contact([pluginEntry('broken', { plugin: 'fixture-sandbox.throws' }), pluginEntry('fine')], {
			workerTypes,
		});

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

describe('contactDeclaredSources - a source that hangs', () => {
	it('does not stop the sources after it from being contacted', async () => {
		const patient = new WorkerTypeInstances(new PluginLoader(), () => {}, { buildTimeoutMs: 60_000 });
		const contacting = contact([pluginEntry('stuck', { plugin: 'fixture-sandbox.slow' }), pluginEntry('fine')], {
			workerTypes: patient,
		});

		await vi.waitFor(() => expect(fixture.obtained.map(o => o.sourceId)).toEqual(['fine']));

		// Let the stuck build finish so the contact (and the test) ends.
		fixture.pendingBuilds.shift()?.();
		await contacting;
		expect(fixture.obtained.map(o => o.sourceId).sort()).toEqual(['fine', 'stuck']);
	});

	// The build bound is shared by every source of a contact and it covers real disk I/O (module import, manifest
	// reads). A wall-clock bound of a few ms made the test depend on the machine load: a 'fine' source that was slow to
	// load was given up too and reported as well. The clock is therefore driven by hand: timers are faked, and the bound
	// only elapses when the test says so.
	describe('with a build bound driven by hand', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		// Resolves once `condition` holds, polling with real macrotasks (setImmediate is not faked), however slow the disk is.
		const untilTrue = async (condition: () => boolean) => {
			for (let attempt = 0; attempt < 10_000 && !condition(); attempt++) {
				await new Promise<void>(resolve => setImmediate(resolve));
			}
			expect(condition()).toBe(true);
		};

		it('reports the hung source by name once its build is given up, and the others are unaffected', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			const impatient = new WorkerTypeInstances(new PluginLoader(), () => {}, { buildTimeoutMs: 30 });

			const contacting = contact([pluginEntry('stuck', { plugin: 'fixture-sandbox.hangs' }), pluginEntry('fine')], {
				workerTypes: impatient,
			});
			// 'fine' is built and asked before the bound is allowed to elapse, whatever the real time that took.
			await untilTrue(() => fixture.obtained.length === 1);
			await vi.advanceTimersByTimeAsync(30);
			await contacting;

			expect(reported).toHaveLength(1);
			expect(reported[0]).toContain('source "stuck"');
			expect(reported[0]).toContain('did not finish loading');
			expect(fixture.obtained.map(o => o.sourceId)).toEqual(['fine']);
		});

		it('also reports a source that is merely slower than the bound (the cause of the former intermittent second report)', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			const realLoader = new PluginLoader();
			let releaseFine: () => void = () => {};
			const fineMayLoad = new Promise<void>(resolve => {
				releaseFine = resolve;
			});
			// A loader whose 'fine' plugin takes longer than the bound, as a loaded machine does.
			const slowDisk: ConstructorParameters<typeof WorkerTypeInstances>[0] = {
				readDeclaredGuarantees: (...args) => realLoader.readDeclaredGuarantees(...args),
				readDeclaredWorkspaces: (...args) => realLoader.readDeclaredWorkspaces(...args),
				loadProvider: async (...args) => {
					if ((args[2] as { sourceId: string }).sourceId === 'fine') {
						await fineMayLoad;
					}
					return realLoader.loadProvider(...args);
				},
			};
			const impatient = new WorkerTypeInstances(slowDisk, () => {}, { buildTimeoutMs: 30 });

			const contacting = contact([pluginEntry('stuck', { plugin: 'fixture-sandbox.hangs' }), pluginEntry('fine')], {
				workerTypes: impatient,
			});
			await vi.advanceTimersByTimeAsync(30);
			releaseFine();
			await contacting;

			expect(reported.map(message => /source "(\w+)"/.exec(message)?.[1]).sort()).toEqual(['fine', 'stuck']);
		});
	});
});
