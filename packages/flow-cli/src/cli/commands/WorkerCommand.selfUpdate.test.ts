import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted state shared between the mocked modules and the tests below.
// ---------------------------------------------------------------------------
const hoisted = vi.hoisted(() => ({
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	wsInstances: [] as any[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	loadForDaemonConfig: { worker: { wsPort: null }, queue: {}, limits: {}, workspace: {}, opencode: {} } as any,
	updateConfig: { channel: 'stable', checkIntervalMs: 1000, disabled: false },
	cache: { lastCheckedAt: 0, latestVersion: null as string | null },
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

vi.mock('../../config/DefaultProjectResolver', () => ({
	DefaultProjectResolver: class {
		resolve(): { projectRoot: string } {
			return { projectRoot: '/fake/project' };
		}
	},
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
	resolveExtraProjects: () => ['/extra/project'],
	buildRegistration: () => ({
		pid: 1234,
		labels: ['label-a', 'label-b'],
		attachedProjects: ['/fake/project', '/extra/project'],
		hasUserInterface: false,
		shellCapabilities: ['bash', 'cmd'],
	}),
	buildStepRunnerConfig: () => ({ interactive: false }),
	probeShellCapabilities: () => ['bash', 'cmd'],
	reconnectDelayMs: () => 500,
	resolveDaemonWsUrl: () => 'ws://127.0.0.1:9999',
	scheduleReconnectTimer: () => setTimeout(() => {}, 0),
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
	declareSelf: () => undefined,
}));

vi.mock('../../worker/WorkerDisplay', () => ({
	WorkerDisplay: class {
		stepStarted(): void {}
		stepCompleted(): void {}
		stepFailed(): void {}
		stepLog(): void {}
	},
}));

vi.mock('../../worker/DaemonWatch', () => ({
	DaemonWatchNotifier: class {
		onNotify(): void {}
		stop(): void {}
	},
}));

// A controllable adapter: execute() returns a promise this test resolves/rejects by hand,
// which is what lets the busy-tracking/re-exec-deferral tests observe "still in-flight" vs
// "just finished" without racing real timers or real step execution.
const executeMock = vi.fn();
vi.mock('../../worker/WorkerAdapter', () => ({
	WorkerAdapter: class {
		execute(...args: unknown[]): Promise<unknown> {
			return executeMock(...args);
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
	readUpdateConfig: () => hoisted.updateConfig,
	readCache: () => hoisted.cache,
	cacheFilePath: (dir: string) => `${dir}/update-cache.json`,
	// Real calver/semver comparator reused as-is (not re-implemented) -- good enough for the
	// plain numeric-ish version strings these tests use.
	semverLte: (a: string, b: string) => a <= b,
}));

const scheduleBackgroundUpdateMock = vi.fn();
vi.mock('@wadeck-app/shared-cli', async importOriginal => {
	const actual = await importOriginal<typeof import('@wadeck-app/shared-cli')>();
	return {
		...actual,
		UpdateManager: class {
			scheduleBackgroundUpdate(...args: unknown[]): void {
				scheduleBackgroundUpdateMock(...args);
			}
		},
	};
});

const spawnMock = vi.fn();
vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: (...args: unknown[]) => spawnMock(...args) };
});

// setInterval/clearInterval are intercepted so each tick can be driven by hand, synchronously,
// instead of racing fake/real timers against the async handleMessage() continuation chain.
const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;

function installManualInterval(): void {
	hoisted.intervalCallbacks.length = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(global as any).setInterval = (fn: () => void): any => {
		hoisted.intervalCallbacks.push(fn);
		return { unref: () => {}, [Symbol.toPrimitive]: () => 0 };
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(global as any).clearInterval = (): void => {};
}

function fireIntervalTick(): void {
	for (const cb of hoisted.intervalCallbacks) cb();
}

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('WorkerCommand -- self re-exec on version bump', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.resetModules();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
		hoisted.wsInstances.length = 0;
		hoisted.cache = { lastCheckedAt: 0, latestVersion: null };
		hoisted.updateConfig = { channel: 'stable', checkIntervalMs: 1000, disabled: false };
		executeMock.mockReset();
		scheduleBackgroundUpdateMock.mockReset();
		spawnMock.mockReset();
		spawnMock.mockReturnValue({ unref: vi.fn() });
		installManualInterval();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		global.setInterval = realSetInterval;
		global.clearInterval = realClearInterval;
	});

	async function startWorker(): Promise<InstanceType<typeof MockWebSocket>> {
		const { Command } = await import('commander');
		const { registerWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);
		await program.parseAsync(['node', 'test', 'worker']);
		const ws = hoisted.wsInstances[hoisted.wsInstances.length - 1];
		ws.readyState = 1;
		ws.emit('open');
		return ws;
	}

	function sendAssign(ws: InstanceType<typeof MockWebSocket>): void {
		ws.emit(
			'message',
			Buffer.from(
				JSON.stringify({
					type: 'assign',
					assignmentId: 'assignment-1',
					stepId: 'step-1',
					stepConfig: { id: 'step-1', type: 'script', script: 'echo hi' },
					executionContext: {
						executionId: 'exec-1',
						inputs: {},
						stepOutputs: {},
						stepMeta: {},
						workspaceDir: '/tmp/ws',
						outputsDir: '/tmp/ws/.meta/outputs',
						cwd: '/tmp/ws',
					},
				})
			)
		);
	}

	it('does not re-exec while the periodic check sees no newer version', async () => {
		executeMock.mockResolvedValue({ output: {}, meta: undefined });
		await startWorker();

		fireIntervalTick();
		await flushMicrotasks();

		expect(scheduleBackgroundUpdateMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('re-execs immediately when a newer version is detected while idle', async () => {
		await startWorker();
		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };

		fireIntervalTick();
		await flushMicrotasks();

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('defers re-exec until the in-flight step finishes when a newer version is detected while busy', async () => {
		let resolveExecute!: (value: { output: Record<string, unknown>; meta?: unknown }) => void;
		executeMock.mockImplementation(
			() =>
				new Promise(resolve => {
					resolveExecute = resolve;
				})
		);

		const ws = await startWorker();
		sendAssign(ws);
		await flushMicrotasks(); // let handleMessage reach the pending adapter.execute() await

		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };
		fireIntervalTick();
		await flushMicrotasks();

		// Busy: the detected bump must not have triggered re-exec yet.
		expect(spawnMock).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();

		resolveExecute({ output: {} });
		await flushMicrotasks();

		// Idle again: the previously-detected bump now fires, without waiting for another tick.
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('is idempotent: the same cached version is only handled once', async () => {
		await startWorker();
		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };

		fireIntervalTick();
		await flushMicrotasks();
		expect(spawnMock).toHaveBeenCalledTimes(1);

		fireIntervalTick();
		await flushMicrotasks();
		// Still just once: the same version must not re-trigger a second spawn/exit.
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledTimes(1);
	});

	it('spawns the re-exec with explicit argv (source/token/project/labels/verbose/interactive), not relying on inherited env', async () => {
		await startWorker();
		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };

		fireIntervalTick();
		await flushMicrotasks();

		expect(spawnMock).toHaveBeenCalledTimes(1);
		const [execPath, args] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
		expect(execPath).toBe(process.execPath);
		expect(args[0]).toBe(process.argv[1]);
		expect(args[1]).toBe('worker');
		expect(args).toContain('--token');
		expect(args).toContain('fake-token');
		expect(args).toContain('--project');
		expect(args).toContain('/extra/project');
		expect(args).toContain('--labels');
		expect(args).toContain('label-a,label-b');
	});

	it('calls cleanup() (releases registry/nudge server) and process.exit(0) after a successful re-exec spawn', async () => {
		await startWorker();
		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };

		fireIntervalTick();
		await flushMicrotasks();

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('busy flag: an exception from adapter.execute() still ends in idle state (finally) and does not block a later re-exec', async () => {
		let rejectExecute!: (err: Error) => void;
		executeMock.mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					rejectExecute = reject;
				})
		);

		const ws = await startWorker();
		sendAssign(ws);
		await flushMicrotasks();

		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };
		fireIntervalTick();
		await flushMicrotasks();
		expect(spawnMock).not.toHaveBeenCalled(); // still busy

		rejectExecute(new Error('step blew up'));
		await flushMicrotasks();

		// Finally must have run despite the throw, flipping busy back to false and firing the
		// deferred re-exec.
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
