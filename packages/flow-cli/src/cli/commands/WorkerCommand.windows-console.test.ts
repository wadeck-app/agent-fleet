/**
 * Windows console inheritance test for WorkerCommand's self re-exec spawn.
 *
 * CREATE_NO_WINDOW (windowsHide:true) and DETACHED_PROCESS (detached:true) remove the
 * console handle from the spawned process. A respawned worker that lost its console would
 * itself go on to launch shell/model-CLI subprocesses (ScriptExecutor, ClaudeLauncher) that
 * call AllocConsole() when they find no console attached -> Windows Terminal pops a visible
 * tab (regression fixed multiple times already: d032e7e, b2bca73, d9af4d67).
 *
 * The respawned worker must inherit this process's console exactly like
 * ForkWorkerSource.obtainWorker() does for daemon-forked workers -- see
 * ForkWorkerSource.windows-console.test.ts for the companion test.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
	wsInstances: [] as any[],
	loadForDaemonConfig: { worker: { wsPort: null }, queue: {}, limits: {}, workspace: {}, opencode: {} } as any,
	cache: { lastCheckedAt: 0, latestVersion: '9999.99.99' as string | null },
	intervalCallbacks: [] as (() => void)[],
}));

vi.mock('../../config/FlowConfig', async () => {
	const actual = await vi.importActual<typeof import('../../config/FlowConfig')>('../../config/FlowConfig');
	return {
		FlowConfigLoader: {
			DEFAULT: actual.FlowConfigLoader.DEFAULT,
			load: actual.FlowConfigLoader.load,
			loadForDaemon: () => ({ config: hoisted.loadForDaemonConfig }),
			applyOpenCodeEnvDefaults: actual.FlowConfigLoader.applyOpenCodeEnvDefaults,
		},
	};
});

vi.mock('../../worker/WorkerProjects', () => ({
	resolveWorkerProjects: () => [{ id: 'fake0001', name: 'fake', path: '/fake/project' }],
}));

vi.mock('../../config/PluginResolver', () => ({
	PluginResolver: {
		create: () => ({
			resolveApproval: async () => undefined,
			resolveApprovalByType: async () => undefined,
		}),
	},
}));

vi.mock('../../worker/WorkerLaunch', () => ({
	resolveSourceId: () => undefined,
	resolveWorkerToken: () => 'fake-token',
	resolveExtraProjects: () => [],
	buildRegistration: () => ({
		pid: 1234,
		labels: [],
		attachedProjectIds: ['fake0001'],
		attachedProjects: ['/fake/project'],
		hasUserInterface: false,
		shellCapabilities: ['bash', 'cmd'],
	}),
	buildStepRunnerConfig: () => ({ interactive: false }),
	probeShellCapabilities: () => ['bash', 'cmd'],
	reconnectDelayMs: () => 500,
	resolveDaemonWsUrl: () => 'ws://127.0.0.1:9999',
	scheduleReconnectTimer: () => undefined as unknown as NodeJS.Timeout,
	withFreshToken: (registration: unknown) => registration,
}));

vi.mock('../../worker/NudgeServer', () => ({
	NudgeServer: class {
		start(): Promise<string> {
			return Promise.resolve('http://127.0.0.1:1/nudge');
		}
		stop(): void {}
		onNotify(): void {}
	},
}));

vi.mock('../../worker/SelfDeclaration', () => ({
	SelfDeclarationManager: class {
		sourceId: string | undefined = undefined;
		release(): void {}
	},
}));
vi.mock('../../worker/WorkerDisplay', () => ({ WorkerDisplay: class {} }));
vi.mock('../../worker/DaemonWatch', () => ({
	DaemonWatchNotifier: class {
		onNotify(): void {}
		stop(): void {}
	},
}));
vi.mock('../../worker/WorkerAdapter', () => ({
	WorkerAdapter: class {
		execute(): Promise<unknown> {
			return new Promise(() => {});
		}
	},
}));

class MockWebSocket extends EventEmitter {
	static OPEN = 1;
	readyState = 0;
	send = vi.fn();
	constructor() {
		super();
		hoisted.wsInstances.push(this);
	}
}
vi.mock('ws', () => ({ WebSocket: MockWebSocket }));

vi.mock('@wadeck-app/shared-updater', () => ({
	readUpdateConfig: () => ({ channel: 'stable', checkIntervalMs: 1000, disabled: false }),
	readCache: () => hoisted.cache,
	cacheFilePath: (dir: string) => `${dir}/update-cache.json`,
	semverLte: (a: string, b: string) => a <= b,
}));

vi.mock('@wadeck-app/shared-cli', async importOriginal => {
	const actual = await importOriginal<typeof import('@wadeck-app/shared-cli')>();
	return {
		...actual,
		UpdateManager: class {
			scheduleBackgroundUpdate(): void {}
		},
	};
});

const spawnMock = vi.fn();
vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: (...args: unknown[]) => spawnMock(...args) };
});

const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;

describe('WorkerCommand -- self re-exec Windows console inheritance (no windowsHide/detached)', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
		hoisted.wsInstances.length = 0;
		hoisted.intervalCallbacks.length = 0;
		(global as any).setInterval = (fn: () => void): any => {
			hoisted.intervalCallbacks.push(fn);
			return { unref: () => {} };
		};
		(global as any).clearInterval = (): void => {};
		spawnMock.mockClear();
		spawnMock.mockImplementation(() => {
			const child = new EventEmitter() as EventEmitter & { unref: () => void };
			child.unref = vi.fn();
			return child;
		});
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		global.setInterval = realSetInterval;
		global.clearInterval = realClearInterval;
	});

	it('re-exec spawn does NOT set windowsHide:true and does NOT set detached:true', async () => {
		const { Command } = await import('commander');
		const { registerWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);
		await program.parseAsync(['node', 'test', 'worker']);

		for (const cb of hoisted.intervalCallbacks) cb();
		for (let i = 0; i < 5; i++) await Promise.resolve();

		expect(spawnMock).toHaveBeenCalledTimes(1);
		const opts = spawnMock.mock.calls[0]![2] as Record<string, unknown>;
		expect(opts['windowsHide']).not.toBe(true);
		expect(opts['detached']).not.toBe(true);
		expect(opts['stdio']).toBe('ignore');
	});
});
