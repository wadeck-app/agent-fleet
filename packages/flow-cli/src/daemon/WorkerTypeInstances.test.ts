import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let fixture: WorkerTypeFixtureState;
let logged: { level: string; message: string }[];
let instances: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	logged = [];
	instances = new WorkerTypeInstances(new PluginLoader(), (level, message) => logged.push({ level, message }));
});

function entry(overrides: Partial<WorkerSourceEntry> = {}): WorkerSourceEntry {
	return {
		sourceId: 'sandbox',
		provider: 'fixture',
		plugin: 'fixture-sandbox.sandbox',
		pluginsDir: FIXTURE_PLUGINS_DIR,
		options: { image: 'node:22' },
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-10-27T00:00:00.000Z',
		...overrides,
	};
}

const messageOf = (promise: Promise<unknown>): Promise<string> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(err: unknown) => (err as Error).message
	);

describe('WorkerTypeInstances - loading', () => {
	it('loads the implementation from an absolute plugins directory and hands it the source id and options', async () => {
		const instance = await instances.get(entry());

		expect(fixture.created).toEqual([{ sourceId: 'sandbox', options: { image: 'node:22' } }]);
		await instance.source.obtainWorker({ daemonEndpoint: 'ws://x', sourceId: 'sandbox', projects: [] });
		expect(fixture.obtained).toHaveLength(1);
	});

	it('reuses the instance across contacts instead of rebuilding the provider', async () => {
		const first = await instances.get(entry());
		const second = await instances.get(entry());

		expect(second).toBe(first);
		expect(fixture.created).toHaveLength(1);
	});

	it('builds one instance per source', async () => {
		await instances.get(entry({ sourceId: 'a' }));
		await instances.get(entry({ sourceId: 'b' }));

		expect(fixture.created.map(c => c.sourceId)).toEqual(['a', 'b']);
	});

	it('shares one build between contacts that overlap', async () => {
		const [first, second] = await Promise.all([instances.get(entry()), instances.get(entry())]);

		expect(second).toBe(first);
		expect(fixture.created).toHaveLength(1);
	});

	it('rejects a relative pluginsDir, naming the source, the plugin, the cause and the fix', async () => {
		const message = await messageOf(instances.get(entry({ pluginsDir: 'plugins' })));

		expect(message).toContain('worker source "sandbox"');
		expect(message).toContain('"fixture-sandbox.sandbox"');
		expect(message).toContain('pluginsDir must be an absolute path, got: "plugins"');
		expect(message).toMatch(/Fix: .*plugin-fixture-sandbox/s);
		expect(message).toContain('flow worker source remove sandbox');
	});

	it('names the source, the plugin and the missing manifest when the directory has no such plugin', async () => {
		const message = await messageOf(instances.get(entry({ pluginsDir: join(tmpdir(), 'no-such-plugins-dir') })));

		expect(message).toContain('worker source "sandbox"');
		expect(message).toContain('"fixture-sandbox.sandbox"');
		expect(message).toContain('No manifest found for plugin "fixture-sandbox"');
		expect(message).toContain('Fix:');
	});

	it('names the implementation when the plugin does not provide it', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.nothere' })));

		expect(message).toContain('does not provide implementation "nothere"');
		expect(message).toContain('"fixture-sandbox.nothere"');
	});

	it('names the source and the plugin when the factory rejects, keeping its cause', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.throws' })));

		expect(message).toContain('worker source "sandbox"');
		expect(message).toContain('fixture factory failure');
	});

	it('refuses an instance that is not a worker-type instance', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.invalid' })));

		expect(message).toMatch(/must resolve to \{ source: \{ obtainWorker\(\) \}, dispose\(\) \}/);
	});

	it('does not remember a failed build: the next contact tries again', async () => {
		await expect(instances.get(entry({ pluginsDir: join(tmpdir(), 'no-such-plugins-dir') }))).rejects.toThrow();

		await expect(instances.get(entry())).resolves.toBeDefined();
		expect(fixture.created).toHaveLength(1);
	});

	it('refuses an entry that is not a plugin source (a wiring mistake, not a user error)', async () => {
		const { plugin: _plugin, pluginsDir: _dir, ...builtIn } = entry();

		await expect(instances.get(builtIn)).rejects.toThrow(/has no plugin/);
	});

	describe('plugins directory spellings', () => {
		it.runIf(process.platform === 'win32')('loads from a Windows drive-letter path with backslashes', async () => {
			const backslashed = FIXTURE_PLUGINS_DIR.replace(/\//g, '\\');
			expect(backslashed).toMatch(/^[A-Za-z]:\\/);

			await expect(instances.get(entry({ pluginsDir: backslashed }))).resolves.toBeDefined();
		});

		it.runIf(process.platform === 'win32')(
			'loads from a Windows drive-letter path with forward slashes',
			async () => {
				const forward = FIXTURE_PLUGINS_DIR.replace(/\\/g, '/');
				expect(forward).toMatch(/^[A-Za-z]:\//);

				await expect(instances.get(entry({ pluginsDir: forward }))).resolves.toBeDefined();
			}
		);

		it('loads from a directory whose path has a space and a non-ASCII letter', async () => {
			const base = mkdtempSync(join(tmpdir(), 'plugins dir-'));
			const copy = join(base, 'é plugins');
			try {
				// Written, not cpSync'd: on Windows cpSync into a directory with a non-ASCII name copies nothing, silently.
				const pluginDir = join(copy, 'plugin-fixture-sandbox');
				mkdirSync(pluginDir, { recursive: true });
				writeFileSync(
					join(pluginDir, 'plugin.config.js'),
					readFileSync(join(FIXTURE_PLUGINS_DIR, 'plugin-fixture-sandbox', 'plugin.config.js'))
				);

				await expect(instances.get(entry({ pluginsDir: copy }))).resolves.toBeDefined();
			} finally {
				rmSync(base, { recursive: true, force: true });
			}
		});
	});
});

describe('WorkerTypeInstances - disposing', () => {
	it('disposes the instance of a source once and forgets it', async () => {
		await instances.get(entry());

		await instances.dispose('sandbox');
		await instances.dispose('sandbox');

		expect(fixture.disposed).toEqual(['sandbox']);
	});

	it('builds a new instance for a source declared again after its removal', async () => {
		await instances.get(entry());
		await instances.dispose('sandbox');

		await instances.get(entry());

		expect(fixture.created).toHaveLength(2);
	});

	it('ignores a source it never built', async () => {
		await expect(instances.dispose('ghost')).resolves.toBeUndefined();
		expect(fixture.disposed).toEqual([]);
	});

	it('logs a failing dispose with the source instead of throwing, and still forgets the instance', async () => {
		await instances.get(entry());
		fixture.failDispose = true;

		await expect(instances.dispose('sandbox')).resolves.toBeUndefined();

		expect(logged).toHaveLength(1);
		expect(logged[0]?.level).toBe('error');
		expect(logged[0]?.message).toContain('source "sandbox"');
		expect(logged[0]?.message).toContain('fixture dispose failure');
		await instances.dispose('sandbox');
		expect(fixture.disposed).toEqual(['sandbox']);
	});

	it('gives up on a dispose that never settles, logs it, and forgets the instance', async () => {
		const patient = new WorkerTypeInstances(
			new PluginLoader(),
			(level, message) => logged.push({ level, message }),
			{ disposeTimeoutMs: 20 }
		);
		await patient.get(entry());
		fixture.hangDispose = true;

		await patient.dispose('sandbox');

		expect(logged).toHaveLength(1);
		expect(logged[0]?.message).toContain('source "sandbox"');
		expect(logged[0]?.message).toMatch(/did not finish.*within/);
		await patient.dispose('sandbox');
		expect(fixture.disposed).toEqual(['sandbox']);
	});

	it('disposes a source that is still being built once the build is done', async () => {
		const building = instances.get(entry());
		const disposing = instances.dispose('sandbox');

		await Promise.all([building, disposing]);

		expect(fixture.disposed).toEqual(['sandbox']);
	});

	it('disposes every instance once on disposeAll, however many times it is called', async () => {
		await instances.get(entry({ sourceId: 'a' }));
		await instances.get(entry({ sourceId: 'b' }));

		await Promise.all([instances.disposeAll(), instances.disposeAll()]);
		await instances.disposeAll();

		expect(fixture.disposed.sort()).toEqual(['a', 'b']);
	});

	it('goes on disposing after one dispose failed', async () => {
		await instances.get(entry({ sourceId: 'a' }));
		await instances.get(entry({ sourceId: 'b' }));
		fixture.failDispose = true;

		await instances.disposeAll();

		expect(fixture.disposed.sort()).toEqual(['a', 'b']);
		expect(logged).toHaveLength(2);
	});

	it('refuses to build an instance once everything was disposed (the daemon is stopping)', async () => {
		await instances.disposeAll();

		await expect(instances.get(entry())).rejects.toThrow(/daemon is stopping/);
		expect(fixture.created).toEqual([]);
	});

	it('disposes the instances of sources that are no longer declared, keeps the others', async () => {
		await instances.get(entry({ sourceId: 'kept' }));
		await instances.get(entry({ sourceId: 'removed' }));

		await instances.retainOnly(['kept']);

		expect(fixture.disposed).toEqual(['removed']);
	});

	it('rebuilds when the declaration changed, disposing the instance built from the old one', async () => {
		const first = await instances.get(entry());
		const second = await instances.get(entry({ options: { image: 'node:24' } }));

		expect(second).not.toBe(first);
		expect(fixture.disposed).toEqual(['sandbox']);
		expect(fixture.created.map(c => c.options)).toEqual([{ image: 'node:22' }, { image: 'node:24' }]);
	});
});

describe('WorkerTypeInstances - run end', () => {
	it('hands the event to the run hook of the instance that owns the source', async () => {
		await instances.get(entry({ sourceId: 'a' }));
		await instances.get(entry({ sourceId: 'b' }));

		await instances.notifyRunEnded('b', { executionId: 'exec-1', reason: 'completed' });

		expect(fixture.runEnded).toEqual([{ sourceId: 'b', event: { executionId: 'exec-1', reason: 'completed' } }]);
	});

	it('does nothing for a source with no instance (a built-in source)', async () => {
		await expect(
			instances.notifyRunEnded('ghost', { executionId: 'e', reason: 'failed' })
		).resolves.toBeUndefined();
		expect(fixture.runEnded).toEqual([]);
	});

	it('lets the hook failure through, for the caller to log with the execution', async () => {
		await instances.get(entry());
		fixture.failRunEnded = true;

		await expect(instances.notifyRunEnded('sandbox', { executionId: 'e', reason: 'failed' })).rejects.toThrow(
			'fixture onRunEnded failure'
		);
	});
});
