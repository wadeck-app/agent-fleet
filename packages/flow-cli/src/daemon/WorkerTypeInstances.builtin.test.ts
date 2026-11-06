import type { WorkerTypeInstance } from 'extension-points';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetBuiltinPluginsForTests, registerBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import type { FlowPlugin } from '../config/FlowPlugin.js';
import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances, type WorkerTypeTimeouts } from './WorkerTypeInstances.js';

/**
 * Which source answers a worker-type reference: the built-in registry first, else the plugins directory. The decision
 * and its reason are in WorkerTypeInstances; these tests pin it.
 */

// The fixture on disk is `fixture-sandbox.sandbox`; a built-in registered under the same reference must win over it.
const SHADOWED_REF = 'fixture-sandbox.sandbox';

let fixture: WorkerTypeFixtureState;
let logged: { level: string; message: string }[];

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	logged = [];
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

function entry(overrides: Partial<WorkerSourceEntry> = {}): WorkerSourceEntry {
	return {
		sourceId: 'sandbox',
		provider: 'fixture',
		plugin: SHADOWED_REF,
		pluginsDir: FIXTURE_PLUGINS_DIR,
		options: { image: 'node:22' },
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-10-27T00:00:00.000Z',
		...overrides,
	};
}

function instances(timeouts: WorkerTypeTimeouts = {}): WorkerTypeInstances {
	return new WorkerTypeInstances(new PluginLoader(), (level, message) => logged.push({ level, message }), timeouts);
}

function builtin(overrides: Partial<WorkerTypeInstance> = {}, extensionPoint = 'worker-type') {
	const created: unknown[] = [];
	const disposed: string[] = [];
	const plugin: FlowPlugin = {
		extensionPoint,
		create: context => {
			created.push(context);
			return Promise.resolve({
				source: { obtainWorker: () => Promise.resolve() },
				dispose: () => {
					disposed.push('disposed');
					return Promise.resolve();
				},
				...overrides,
			} as WorkerTypeInstance);
		},
	};
	return { plugin, created, disposed };
}

const messageOf = (promise: Promise<unknown>): Promise<string> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(err: unknown) => (err as Error).message
	);

describe('WorkerTypeInstances - registry before pluginsDir', () => {
	it('is answered by the built-in registry even when pluginsDir holds a copy of the same reference', async () => {
		const { plugin, created } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);

		await instances().get(entry());

		expect(created).toHaveLength(1);
		// The on-disk copy was never loaded.
		expect(fixture.created).toEqual([]);
	});

	it('says in the log that the built-in answered and that the pluginsDir copy was ignored', async () => {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, builtin().plugin);

		await instances().get(entry());

		const line = logged.find(item => item.message.includes('built-in registry'));
		expect(line?.level).toBe('info');
		expect(line?.message).toContain('"sandbox"');
		expect(line?.message).toContain(SHADOWED_REF);
		expect(line?.message).toContain(FIXTURE_PLUGINS_DIR);
		expect(line?.message).toMatch(/ignored/);
	});

	it('falls back to the pluginsDir when nothing is registered, and logs that the directory answered', async () => {
		await instances().get(entry());

		expect(fixture.created).toHaveLength(1);
		const line = logged.find(item => item.message.includes('plugins directory'));
		expect(line?.level).toBe('info');
		expect(line?.message).toContain('"sandbox"');
		expect(line?.message).toContain(FIXTURE_PLUGINS_DIR);
	});

	it('hands the daemon host services to a built-in only, never to a plugin loaded from disk', async () => {
		const host = { findRelay: () => undefined };
		const { plugin, created } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);

		await instances().get(entry(), host);
		expect(created).toEqual([{ sourceId: 'sandbox', options: { image: 'node:22' }, host }]);

		__resetBuiltinPluginsForTests();
		await instances().get(entry({ sourceId: 'other' }), host);
		expect(fixture.created).toEqual([{ sourceId: 'other', options: { image: 'node:22' } }]);
	});

	it('refuses a built-in registered for another extension point, naming the source and the plugin', async () => {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, builtin({}, 'permission-prompt').plugin);

		const message = await messageOf(instances().get(entry()));

		expect(message).toContain('"sandbox"');
		expect(message).toContain(SHADOWED_REF);
		expect(message).toContain('permission-prompt');
	});

	it('enforces the worker-type instance contract on a built-in too', async () => {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, builtin({ dispose: undefined }).plugin);

		const message = await messageOf(instances().get(entry()));

		expect(message).toContain('"sandbox"');
		expect(message).toContain('dispose()');
	});

	it('bounds the build of a built-in by the same build timeout as a plugin from disk', async () => {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, {
			extensionPoint: 'worker-type',
			create: () => new Promise<never>(() => {}),
		});

		const message = await messageOf(instances({ buildTimeoutMs: 20 }).get(entry()));

		expect(message).toContain('did not finish loading within 20ms');
	});

	it('disposes a built-in once, however many times it is disposed', async () => {
		const { plugin, disposed } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);
		const owner = instances();
		await owner.get(entry());

		await Promise.all([owner.dispose('sandbox'), owner.dispose('sandbox'), owner.disposeAll()]);

		expect(disposed).toEqual(['disposed']);
	});

	it('gives up on a built-in whose dispose hangs after the dispose bound, and logs it', async () => {
		registerBuiltinPlugin(
			`plugins.${SHADOWED_REF}`,
			builtin({ dispose: () => new Promise<never>(() => {}) }).plugin
		);
		const owner = instances({ disposeTimeoutMs: 20 });
		await owner.get(entry());

		await owner.dispose('sandbox');

		expect(
			logged.some(item => item.level === 'error' && item.message.includes('did not finish disposing within 20ms'))
		).toBe(true);
	});
});

describe('WorkerTypeInstances - a built-in that fails to load', () => {
	const DISK_ADVICE = /plugin\.config\.js|To drop the source|plugins directory holds/;

	async function failureOf(plugin: FlowPlugin, timeouts: WorkerTypeTimeouts = {}): Promise<string> {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);
		return messageOf(instances(timeouts).get(entry()));
	}

	it('reports a failing factory as a bug of flow, with the source and the cause, and no advice for plugins on disk', async () => {
		const message = await failureOf({
			extensionPoint: 'worker-type',
			create: () => Promise.reject(new Error('boom')),
		});

		expect(message).toBe(
			`Cannot load worker source "sandbox": "${SHADOWED_REF}" is a built-in worker type of flow and failed: Error: boom. ` +
				'This is a bug in flow, not in your configuration: please report this error.'
		);
		expect(message).not.toMatch(DISK_ADVICE);
	});

	it('reports a contract violation the same way', async () => {
		const message = await failureOf(builtin({ dispose: undefined }).plugin);

		expect(message).toContain('is a built-in worker type of flow and failed');
		expect(message).toContain('dispose()');
		expect(message).toContain('please report this error');
		expect(message).not.toMatch(DISK_ADVICE);
	});

	it('reports a build that never finishes the same way', async () => {
		const message = await failureOf(
			{ extensionPoint: 'worker-type', create: () => new Promise<never>(() => {}) },
			{
				buildTimeoutMs: 20,
			}
		);

		expect(message).toContain('is a built-in worker type of flow and failed: did not finish loading within 20ms');
		expect(message).toContain('please report this error');
		expect(message).not.toMatch(DISK_ADVICE);
	});

	it('keeps the advice for plugins on disk when the directory answered', async () => {
		const message = await messageOf(instances().get(entry({ plugin: 'fixture-sandbox.missing' })));

		expect(message).toContain('plugin.config.js');
		expect(message).not.toContain('built-in worker type of flow');
	});
});

describe('WorkerTypeInstances - a built-in without pluginsDir', () => {
	it('builds a registry-answered built-in from an entry that has no directory, and logs that no directory was involved', async () => {
		const { plugin, created } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);
		const { pluginsDir: _omitted, ...withoutDir } = entry();
		const logged2 = logged;

		await instances().get(withoutDir);

		expect(created).toHaveLength(1);
		const line = logged2.find(item => item.message.includes('built-in registry'));
		expect(line?.message).toBe(
			`worker source "sandbox": plugin "${SHADOWED_REF}" answered by the built-in registry.`
		);
	});

	it('refuses a ref that is not a built-in without a directory, telling the user how to fix the entry', async () => {
		const { pluginsDir: _omitted, ...withoutDir } = entry();

		const message = await messageOf(instances().get(withoutDir));

		expect(message).toBe(
			`worker source "sandbox": plugin "${SHADOWED_REF}" is not a built-in worker type of flow and has no pluginsDir, so the daemon would not know where to load it from. ` +
				'"flow worker source add" would have refused this entry. Fix: flow worker source remove sandbox, then declare it again with --plugins-dir <absolute directory that contains plugin-<pluginId>/>.'
		);
	});

	it('reports an entry without a plugin as a wiring mistake', async () => {
		const { plugin: _omitted, ...withoutPlugin } = entry();

		const message = await messageOf(instances().get(withoutPlugin));

		expect(message).toBe(
			'worker source "sandbox" has no plugin, so there is no worker-type instance to build. This is a wiring mistake in the daemon, not a configuration error -- please report it.'
		);
	});

	it('names no directory in a built-in failure either', async () => {
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, {
			extensionPoint: 'worker-type',
			create: () => Promise.reject(new Error('boom')),
		});
		const { pluginsDir: _omitted, ...withoutDir } = entry();

		const message = await messageOf(instances().get(withoutDir));

		expect(message).toContain('is a built-in worker type of flow and failed');
		expect(message).not.toContain('undefined');
	});
});

describe('WorkerTypeInstances - the launch-token service', () => {
	it('lends issueLaunchToken to a built-in and never to a plugin loaded from disk', async () => {
		const host = { issueLaunchToken: () => 'minted' };
		const { plugin, created } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);

		await instances().get(entry(), host);
		expect(created).toEqual([{ sourceId: 'sandbox', options: { image: 'node:22' }, host }]);

		__resetBuiltinPluginsForTests();
		await instances().get(entry({ sourceId: 'other' }), host);
		expect(fixture.created).toEqual([{ sourceId: 'other', options: { image: 'node:22' } }]);
	});
});

describe('WorkerTypeInstances - the fork inputs', () => {
	it('lends host.fork to a built-in and never to a plugin loaded from disk', async () => {
		const host = { fork: { httpPort: 1, wsPort: 2 } };
		const { plugin, created } = builtin();
		registerBuiltinPlugin(`plugins.${SHADOWED_REF}`, plugin);

		await instances().get(entry(), host);
		expect(created).toEqual([{ sourceId: 'sandbox', options: { image: 'node:22' }, host }]);

		__resetBuiltinPluginsForTests();
		await instances().get(entry({ sourceId: 'other' }), host);
		expect(fixture.created).toEqual([{ sourceId: 'other', options: { image: 'node:22' } }]);
	});
});
