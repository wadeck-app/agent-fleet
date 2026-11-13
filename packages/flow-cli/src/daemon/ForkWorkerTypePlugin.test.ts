import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests, getBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';

const spawnMock = vi.fn();
vi.mock('node:child_process', async importOriginal => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn: (...args: unknown[]) => spawnMock(...args),
}));
vi.mock('node:fs', async importOriginal => ({
	...(await importOriginal<typeof import('node:fs')>()),
	existsSync: (p: string) => p.includes('Worker.js'),
}));

const writeDaemonLogMock = vi.fn();
vi.mock('./DaemonLog.js', () => ({ writeDaemonLog: (...args: unknown[]) => writeDaemonLogMock(...args) }));

const { registerBuiltinWorkerTypes } = await import('./BuiltinWorkerTypes.js');
const { FORK_WORKER_TYPE_REF, buildForkWorkerType, forkWorkerTypePlugin } = await import('./ForkWorkerTypePlugin.js');
const { ForkWorkerSource } = await import('./ForkWorkerSource.js');
const { createDaemonForkWorkers } = await import('./DaemonForkWorkers.js');
const { PluginConfigurationError } = await import('./PluginConfigurationError.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

const request = { daemonEndpoint: 'loopback', sourceId: 'built-in:fork', projects: [] as string[] };
let dir: string;

function fakeChild(pid: number) {
	return { pid, killed: false, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } };
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fork-plugin-'));
	spawnMock.mockReset();
	spawnMock.mockReturnValue(fakeChild(5));
	writeDaemonLogMock.mockReset();
	resetWorkerTypeFixture();
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	vi.useRealTimers();
	__resetBuiltinPluginsForTests();
	rmSync(dir, { recursive: true, force: true });
});

describe('fork worker-type plugin', () => {
	it('is a worker-type plugin registered under plugins.fork.default', () => {
		registerBuiltinWorkerTypes();
		registerBuiltinWorkerTypes();

		expect(FORK_WORKER_TYPE_REF).toBe('plugins.fork.default');
		expect(forkWorkerTypePlugin.extensionPoint).toBe('worker-type');
		expect(getBuiltinPlugin(FORK_WORKER_TYPE_REF)).toBe(forkWorkerTypePlugin);
	});

	it('builds an instance over the existing ForkWorkerSource, built from the inputs the daemon lends', async () => {
		const instance = buildForkWorkerType({ httpPort: 100, wsPort: () => 200, claudePath: 'C:/claude.exe' });

		expect(instance.source).toBeInstanceOf(ForkWorkerSource);
		await instance.source.obtainWorker(request);
		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect([env['FLOW_DAEMON_PORT'], env['FLOW_WS_PORT'], env['FLOW_CLAUDE_PATH']]).toEqual([
			'100',
			'200',
			'C:/claude.exe',
		]);
	});

	it('has no per-run hook, and dispose is idempotent and does not stop the workers (the stop sequence owns that)', async () => {
		vi.useFakeTimers();
		const child = fakeChild(9);
		spawnMock.mockReturnValue(child);
		const instance = buildForkWorkerType({ httpPort: 1, wsPort: 2 });
		await instance.source.obtainWorker(request);

		await instance.dispose();
		await instance.dispose();
		vi.advanceTimersByTime(1_000);

		expect(instance.run).toBeUndefined();
		expect(child.kill).not.toHaveBeenCalled();
	});

	it('is built by its factory only from the inputs of the daemon host', async () => {
		const instance = (await forkWorkerTypePlugin.create({
			sourceId: 'built-in:fork',
			host: { fork: { httpPort: 1, wsPort: 2 } },
		})) as ReturnType<typeof buildForkWorkerType>;

		expect(instance.source).toBeInstanceOf(ForkWorkerSource);
	});

	it('builds the same worker as the daemon path: same spawn command, arguments and environment', async () => {
		const viaPlugin = (await forkWorkerTypePlugin.create({
			sourceId: 'built-in:fork',
			host: { fork: { httpPort: 100, wsPort: () => 200, claudePath: 'C:/claude.exe' } },
		})) as ReturnType<typeof buildForkWorkerType>;
		const viaDaemon = createDaemonForkWorkers({
			port: 100,
			wsPort: () => 200,
			claudePath: 'C:/claude.exe',
			logsDir: 'C:/logs',
			maskText: text => text,
		});

		await viaPlugin.source.obtainWorker(request);
		await viaDaemon.source.obtainWorker(request);

		const [pluginSpawn, daemonSpawn] = spawnMock.mock.calls as [unknown[], unknown[]];
		expect(daemonSpawn).toEqual(pluginSpawn);
	});

	it('refuses to be built for a declared source, as a configuration error that says how to fix it', async () => {
		const error = await forkWorkerTypePlugin.create({ sourceId: 'laptop', options: {} }).then(
			() => undefined,
			(err: unknown) => err
		);

		expect(error).toBeInstanceOf(PluginConfigurationError);
		expect((error as Error).message).toBe(
			'the fork worker type is the daemon\'s own fallback and cannot be built for the declared source "laptop". Fix: flow worker source remove laptop.'
		);
	});

	it('is rendered that way by the daemon when an entry names it', async () => {
		const instances = new WorkerTypeInstances(new PluginLoader(), () => {});
		const entry = {
			sourceId: 'laptop',
			provider: 'fork',
			plugin: 'fork.default',
			labels: [],
			maxWorkers: 1,
			tokenHash: 'h',
			createdAt: '2026-11-06T00:00:00.000Z',
		};

		const message = await instances.get(entry, { issueLaunchToken: () => 'x' }).then(
			() => '',
			(err: unknown) => (err as Error).message
		);

		expect(message).toBe(
			'Cannot load worker source "laptop": configuration error in its built-in worker type "fork.default": ' +
				'the fork worker type is the daemon\'s own fallback and cannot be built for the declared source "laptop". Fix: flow worker source remove laptop.'
		);
	});

	it('refuses wrongly shaped inputs as a wiring mistake', async () => {
		await expect(
			forkWorkerTypePlugin.create({ sourceId: 'built-in:fork', host: { fork: { httpPort: 'x', wsPort: 2 } } })
		).rejects.toThrow(
			'the fork worker type needs host.fork.httpPort to be a number, got string. This is a wiring mistake in the daemon, not a configuration error -- please report it.'
		);
	});
});

describe('the daemon fork collaborator', () => {
	it('builds the fork source from the daemon inputs: the ws port is read at spawn time and the claude path is passed', async () => {
		let boundPort = 111;
		const maskText = vi.fn((text: string) => `masked:${text}`);
		const workers = createDaemonForkWorkers({
			port: 100,
			wsPort: () => boundPort,
			claudePath: 'C:/claude.exe',
			logsDir: 'C:/logs',
			maskText,
		});

		boundPort = 222;
		await workers.source.obtainWorker(request);

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(env['FLOW_WS_PORT']).toBe('222');
		expect(workers.source).toBeInstanceOf(ForkWorkerSource);
	});

	it('masks the stderr tail of a dying worker with the masker the daemon lent, before it reaches the daemon log', async () => {
		const child = Object.assign(new EventEmitter(), {
			pid: 51,
			killed: false,
			kill: vi.fn(),
			stderr: new EventEmitter(),
		});
		spawnMock.mockReturnValue(child);
		const maskText = vi.fn((text: string) => text.replace('hunter2', '***'));
		const workers = createDaemonForkWorkers({
			port: 1,
			wsPort: () => 2,
			claudePath: undefined,
			logsDir: 'C:/logs',
			maskText,
		});

		await workers.source.obtainWorker(request);
		child.stderr.emit('data', Buffer.from('token=hunter2 failed\n'));
		child.emit('exit', 1, null);
		child.emit('close', 1, null);

		expect(maskText).toHaveBeenCalled();
		const logged = writeDaemonLogMock.mock.calls.map(call => String(call[2])).join('\n');
		expect(logged).toContain('token=*** failed');
		expect(logged).not.toContain('hunter2');
	});

	it('writes worker lifecycle lines to the daemon log of its logs directory', async () => {
		vi.useFakeTimers();
		spawnMock.mockReturnValue(fakeChild(31));
		const workers = createDaemonForkWorkers({
			port: 1,
			wsPort: () => 2,
			claudePath: undefined,
			logsDir: 'C:/logs',
			maskText: text => text,
		});

		await workers.source.obtainWorker(request);
		vi.advanceTimersByTime(10_000);

		expect(writeDaemonLogMock).toHaveBeenCalledWith(
			'C:/logs',
			'error',
			'worker pid 31 did not connect within 10000ms -- killing'
		);
	});

	it('terminate ends the workers still running after the grace', async () => {
		vi.useFakeTimers();
		const child = fakeChild(41);
		spawnMock.mockReturnValue(child);
		const workers = createDaemonForkWorkers({
			port: 1,
			wsPort: () => 2,
			claudePath: undefined,
			logsDir: 'C:/logs',
			maskText: text => text,
		});
		await workers.source.obtainWorker(request);
		workers.source.acknowledgeConnection(41);

		workers.terminate(2_000);
		vi.advanceTimersByTime(2_000);

		expect(child.kill).toHaveBeenCalledWith('SIGKILL');
	});
});

describe('a fork source cannot be declared', () => {
	const declaration = (extra: Record<string, unknown>) => ({
		sourceId: 'laptop',
		provider: 'free',
		labels: [],
		maxWorkers: 1,
		...extra,
	});
	const refusal =
		'Worker source "laptop": fork is the daemon\'s own fallback and cannot be declared as a source. ' +
		'The daemon forks a worker itself when a step has nobody to run it. ' +
		'To add capacity, declare a built-in:command source that launches "flow worker", or a built-in:inbound source for a worker you start yourself.';

	it.each([
		['the plugin ref', { plugin: 'fork.default' }],
		['the type reference', { plugin: 'plugins.fork.default' }],
		['the plugin ref with a plugins directory', { plugin: 'fork.default', pluginsDir: process.cwd() }],
		['the provider string', { provider: 'built-in:fork' }],
	])('refuses %s with an actionable message, and writes nothing', (_name, extra) => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare(declaration(extra))).toThrow(refusal);
		expect(registry.list()).toEqual([]);
	});

	it('does not refuse a near miss: fork.defualt is a plugin that needs a directory like any other', () => {
		expect(() => new WorkerSourceRegistry(dir).declare(declaration({ plugin: 'fork.defualt' }))).toThrow(
			'names plugin "fork.defualt" but no pluginsDir'
		);
	});

	it('does not look at plugin fixtures: a plugin from disk named fork-like is unaffected', () => {
		expect(
			new WorkerSourceRegistry(dir).declare(
				declaration({ plugin: 'fixture-sandbox.sandbox', pluginsDir: FIXTURE_PLUGINS_DIR })
			).warnings
		).toEqual([]);
	});
});

describe('a stored source whose provider is built-in:fork', () => {
	it('is reported with what is wrong and what to do, not as an unknown provider', async () => {
		const reported: string[] = [];

		await contactDeclaredSources(
			[
				{
					sourceId: 'forked',
					provider: 'built-in:fork',
					labels: [],
					maxWorkers: 1,
					tokenHash: 'h',
					createdAt: '2026-11-06T00:00:00.000Z',
				},
			],
			'ws://127.0.0.1:4101',
			message => reported.push(message),
			{}
		);

		expect(reported).toEqual([
			'could not obtain a worker from source "forked": fork is the daemon\'s own fallback and cannot be a declared source (its stored provider is built-in:fork). ' +
				'Fix: flow worker source remove forked; to add capacity declare a built-in:command source that launches "flow worker", or a built-in:inbound source for a worker you start yourself.',
		]);
	});
});
