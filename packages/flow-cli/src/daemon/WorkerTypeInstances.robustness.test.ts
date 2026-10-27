import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

// A plugin is third-party code: it can hang, fail late, or be reconfigured while a build is in flight. None of that
// may block the daemon (contacts, stop) or leak what the plugin built.

let fixture: WorkerTypeFixtureState;
let logged: { level: string; message: string }[];
let instances: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	logged = [];
	instances = new WorkerTypeInstances(new PluginLoader(), (level, message) => logged.push({ level, message }), {
		buildTimeoutMs: 40,
		disposeTimeoutMs: 40,
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
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

describe('WorkerTypeInstances -- a build that never finishes', () => {
	it('gives up on a factory that never settles, naming the source, the plugin and the wait', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.hangs' })));

		expect(message).toContain('worker source "sandbox"');
		expect(message).toContain('"fixture-sandbox.hangs"');
		expect(message).toMatch(/did not finish loading within/);
	});

	it('does not remember the failed build: the next get builds again', async () => {
		await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.hangs' })));

		await expect(instances.get(entry())).resolves.toBeDefined();
	});

	it('disposes an instance whose build finished only after the wait was given up', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.slow' })));
		expect(message).toMatch(/did not finish loading within/);

		fixture.pendingBuilds.shift()?.();
		await vi.waitFor(() => expect(fixture.disposed).toEqual(['sandbox']));
	});

	it('disposeAll is bounded when a build is still pending', async () => {
		const building = instances.get(entry({ plugin: 'fixture-sandbox.slow' })).catch(() => undefined);
		const started = Date.now();

		await instances.disposeAll();

		expect(Date.now() - started).toBeLessThan(1_000);
		await building;
	});

	it('retainOnly is bounded when a build is still pending', async () => {
		const building = instances.get(entry({ plugin: 'fixture-sandbox.slow' })).catch(() => undefined);
		const started = Date.now();

		await instances.retainOnly([]);

		expect(Date.now() - started).toBeLessThan(1_000);
		await building;
	});

	it('gives up on a dispose that waits for a pending build, logs it, and disposes the instance once it exists', async () => {
		const slowDispose = new WorkerTypeInstances(
			new PluginLoader(),
			(level, message) => logged.push({ level, message }),
			{
				buildTimeoutMs: 5_000,
				disposeTimeoutMs: 30,
			}
		);
		const building = slowDispose.get(entry({ plugin: 'fixture-sandbox.slow' }));

		await slowDispose.dispose('sandbox');

		expect(logged.some(l => l.message.includes('source "sandbox"') && /did not finish/.test(l.message))).toBe(true);
		fixture.pendingBuilds.shift()?.();
		await building;
		await vi.waitFor(() => expect(fixture.disposed).toEqual(['sandbox']));
	});
});

describe('WorkerTypeInstances -- two contacts racing on a changed declaration', () => {
	it('keeps one instance and disposes the one it replaced', async () => {
		await instances.get(entry());
		const changed = entry({ options: { image: 'node:24' } });

		const [a, b] = await Promise.all([instances.get(changed), instances.get(changed)]);

		expect(b).toBe(a);
		expect(fixture.created).toHaveLength(2);
		expect(fixture.disposed).toEqual(['sandbox']);
		await instances.disposeAll();
		expect(fixture.disposed).toEqual(['sandbox', 'sandbox']);
	});

	it('leaves nothing undisposed when the two contacts declare different settings', async () => {
		await instances.get(entry());

		await Promise.all([
			instances.get(entry({ options: { image: 'a' } })),
			instances.get(entry({ options: { image: 'b' } })),
		]);
		await instances.disposeAll();

		expect(fixture.disposed).toHaveLength(fixture.created.length);
	});
});

describe('WorkerTypeInstances -- ${ENV_VAR} options', () => {
	it('hands the plugin the value of the daemon environment variable, not the reference', async () => {
		vi.stubEnv('SANDBOX_TOKEN', 'from-env');

		await instances.get(
			entry({ options: { token: '${SANDBOX_TOKEN}', image: 'node:22', url: 'https://${SANDBOX_TOKEN}@h' } })
		);

		expect(fixture.created[0]?.options).toEqual({ token: 'from-env', image: 'node:22', url: 'https://from-env@h' });
	});

	it('fails naming the source, the option and the unset variable, and builds nothing', async () => {
		delete process.env['SANDBOX_TOKEN'];

		const message = await messageOf(instances.get(entry({ options: { token: '${SANDBOX_TOKEN}' } })));

		expect(message).toContain('worker source "sandbox"');
		expect(message).toContain('option "token"');
		expect(message).toContain('"SANDBOX_TOKEN"');
		expect(message).toMatch(/not set/);
		expect(fixture.created).toEqual([]);
	});

	it('resolves nested option values too', async () => {
		vi.stubEnv('SANDBOX_TOKEN', 'from-env');

		await instances.get(entry({ options: { auth: { token: '${SANDBOX_TOKEN}' }, list: ['${SANDBOX_TOKEN}'] } }));

		expect(fixture.created[0]?.options).toEqual({ auth: { token: 'from-env' }, list: ['from-env'] });
	});
});

describe('WorkerTypeInstances -- load errors say what really fixes them', () => {
	it('tells the user to restart the daemon, and does not promise a retry', async () => {
		const message = await messageOf(instances.get(entry({ plugin: 'fixture-sandbox.throws' })));

		expect(message).toMatch(/restart the daemon/i);
		expect(message).not.toMatch(/tries again/i);
	});
});

describe('WorkerTypeInstances -- the plugin ref is a name, not a path', () => {
	it.each(['sandbox/../x.docker', 'a\\b.docker', 'fixture-sandbox.sa/ndbox', '../fixture-sandbox.sandbox'])(
		'refuses %j before touching the file system',
		async ref => {
			const message = await messageOf(instances.get(entry({ plugin: ref })));

			expect(message).toContain('worker source "sandbox"');
			expect(message).toMatch(/plugin must be "<pluginId>\.<implName>"/);
			expect(fixture.created).toEqual([]);
		}
	);
});

describe('WorkerTypeInstances -- a source removed while a run is live', () => {
	it('says so when the run ends and no instance is left to tell', async () => {
		await instances.get(entry());
		await instances.retainOnly([]);

		await instances.notifyRunEnded('sandbox', { executionId: 'exec-9', reason: 'completed' });

		const warning = logged.find(l => l.message.includes('exec-9'));
		expect(warning?.message).toContain('source "sandbox"');
		expect(warning?.message).toMatch(/removed|no longer declared/);
		expect(fixture.runEnded).toEqual([]);
	});

	it('stays quiet for a source that never had an instance (a built-in source)', async () => {
		await instances.notifyRunEnded('built-in-source', { executionId: 'e', reason: 'failed' });

		expect(logged).toEqual([]);
	});

	it('stops warning once the source is declared and built again', async () => {
		await instances.get(entry());
		await instances.retainOnly([]);
		await instances.get(entry());

		await instances.notifyRunEnded('sandbox', { executionId: 'e', reason: 'failed' });

		expect(logged).toEqual([]);
		expect(fixture.runEnded).toHaveLength(1);
	});
});

describe('WorkerTypeInstances -- plugin directories are trusted, not contained', () => {
	it('follows a junction inside pluginsDir to a plugin that lives elsewhere (accepted: pluginsDir is user-chosen)', async () => {
		const base = mkdtempSync(join(tmpdir(), 'plugins-junction-'));
		try {
			const pluginsDir = join(base, 'plugins');
			mkdirSync(pluginsDir);
			symlinkSync(
				join(FIXTURE_PLUGINS_DIR, 'plugin-fixture-sandbox'),
				join(pluginsDir, 'plugin-fixture-sandbox'),
				'junction'
			);

			await expect(instances.get(entry({ pluginsDir }))).resolves.toBeDefined();
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});
