import { EventEmitter } from 'node:events';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Characterization of `flow worker`'s connection loop, message handling and startup banner,
// driven through registerWorkerCommand with every collaborator mocked.
const hoisted = vi.hoisted(() => ({
	wsInstances: [] as any[],
	wsUrls: [] as string[],
	reconnectTimers: [] as { delay: number; callback: () => void }[],
	notifyCallbacks: [] as ((wsUrl?: string) => void)[],
	resolveDaemonWsUrl: (() => 'ws://127.0.0.1:9999') as () => string,
	nudgeStartError: undefined as Error | undefined,
	hasUserInterface: false,
	approval: undefined as { requiresTerminal?: boolean } | undefined,
	declarationSourceId: undefined as string | undefined,
	cache: { lastCheckedAt: 0, latestVersion: null as string | null },
	intervalCallbacks: [] as (() => void)[],
	displayCalls: [] as unknown[][],
}));

vi.mock('../../config/FlowConfig', () => ({
	FlowConfigLoader: {
		loadForDaemon: () => ({ config: { worker: { wsPort: null }, opencode: {} } }),
		applyOpenCodeEnvDefaults: () => {},
	},
}));

vi.mock('../../worker/WorkerProjects', () => ({
	resolveWorkerProjects: () => [{ id: 'fake0001', name: 'fake', path: '/fake/project' }],
}));

vi.mock('../../config/PluginResolver', () => ({
	PluginResolver: {
		create: () => ({
			resolveApproval: async () => Promise.resolve(hoisted.approval),
			resolveApprovalByType: async () => Promise.resolve(undefined),
		}),
	},
}));

vi.mock('../../worker/WorkerLaunch', () => ({
	resolveSourceId: () => undefined,
	resolveWorkerToken: () => 'fake-token',
	resolveExtraProjects: () => ['extra-project'],
	buildRegistration: () => ({
		pid: 1234,
		labels: ['label-a'],
		attachedProjectIds: ['fake0001'],
		attachedProjects: ['/fake/project'],
		hasUserInterface: hoisted.hasUserInterface,
		shellCapabilities: [],
	}),
	buildStepRunnerConfig: () => ({ interactive: false }),
	probeShellCapabilities: () => [],
	reconnectDelayMs: () => 500,
	resolveDaemonWsUrl: () => hoisted.resolveDaemonWsUrl(),
	scheduleReconnectTimer: (delay: number, callback: () => void) => {
		hoisted.reconnectTimers.push({ delay, callback });
		return { unref: () => {} } as unknown as NodeJS.Timeout;
	},
	withFreshToken: (registration: unknown) => registration,
}));

vi.mock('../../worker/NudgeServer', () => ({
	NudgeServer: class {
		start(): Promise<string> {
			if (hoisted.nudgeStartError !== undefined) {
				return Promise.reject(hoisted.nudgeStartError);
			}
			return Promise.resolve('http://127.0.0.1:1/nudge');
		}
		stop(): void {}
		onNotify(callback: (wsUrl?: string) => void): void {
			hoisted.notifyCallbacks.push(callback);
		}
	},
}));

vi.mock('../../worker/SelfDeclaration', () => ({
	SelfDeclarationManager: class {
		sourceId: string | undefined = hoisted.declarationSourceId;
		release(): void {}
	},
}));

vi.mock('../../worker/WorkerDisplay', () => ({
	WorkerDisplay: class {
		stepStarted(...args: unknown[]): void {
			hoisted.displayCalls.push(['stepStarted', ...args]);
		}
		stepCompleted(...args: unknown[]): void {
			hoisted.displayCalls.push(['stepCompleted', args[0]]);
		}
		stepFailed(...args: unknown[]): void {
			hoisted.displayCalls.push(['stepFailed', args[0], args[1]]);
		}
		stepLog(): void {}
	},
}));

vi.mock('../../worker/DaemonWatch', () => ({
	DaemonWatchNotifier: class {
		onNotify(callback: (wsUrl?: string) => void): void {
			hoisted.notifyCallbacks.push(callback);
		}
		stop(): void {}
	},
}));

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
	OPEN = 1;
	readyState = 1;
	send = vi.fn();
	constructor(url: string) {
		super();
		hoisted.wsUrls.push(url);
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

const sendAssign = (ws: MockWebSocket): void => {
	ws.emit(
		'message',
		Buffer.from(
			JSON.stringify({
				type: 'assign',
				assignmentId: 'assignment-1',
				stepId: 'step-1',
				stepConfig: { id: 'step-1', name: 'My step', type: 'script', script: 'echo hi' },
				executionContext: { executionId: 'exec-1', flowId: 'flow-1', flowVersion: 3 },
			})
		)
	);
};

const flush = async (): Promise<void> => {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
};

const sentTypes = (ws: MockWebSocket): string[] =>
	ws.send.mock.calls.map((call: unknown[]) => (JSON.parse(String(call[0])) as { type: string }).type);

describe('WorkerCommand -- connection, messages and banner (characterization)', () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	const realSetInterval = global.setInterval;
	const realClearInterval = global.clearInterval;

	beforeAll(async () => {
		await import('./WorkerCommand');
	});

	beforeEach(() => {
		vi.resetModules();
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		hoisted.wsInstances.length = 0;
		hoisted.wsUrls.length = 0;
		hoisted.reconnectTimers.length = 0;
		hoisted.notifyCallbacks.length = 0;
		hoisted.intervalCallbacks.length = 0;
		hoisted.displayCalls.length = 0;
		hoisted.resolveDaemonWsUrl = () => 'ws://127.0.0.1:9999';
		hoisted.nudgeStartError = undefined;
		hoisted.hasUserInterface = false;
		hoisted.approval = undefined;
		hoisted.declarationSourceId = undefined;
		hoisted.cache = { lastCheckedAt: 0, latestVersion: null };
		executeMock.mockReset();
		(global as any).setInterval = (fn: () => void): any => {
			hoisted.intervalCallbacks.push(fn);
			return { unref: () => {} };
		};
		(global as any).clearInterval = (): void => {};
	});

	afterEach(() => {
		global.setInterval = realSetInterval;
		global.clearInterval = realClearInterval;
		vi.restoreAllMocks();
	});

	async function startWorker(args: string[] = []): Promise<void> {
		const { Command } = await import('commander');
		const { registerWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);
		await program.parseAsync(['node', 'test', 'worker', ...args]);
	}

	const logged = (): string => logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
	const errored = (): string => errorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');

	it('sends ready with the registration when the socket opens', async () => {
		await startWorker();
		const ws = hoisted.wsInstances[0];
		ws.emit('open');

		expect(hoisted.wsUrls).toEqual(['ws://127.0.0.1:9999']);
		const sent = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as Record<string, unknown>;
		expect(sent['type']).toBe('ready');
		expect(sent['pid']).toBe(1234);
	});

	it('warns and ignores an unparseable daemon message', async () => {
		await startWorker();
		hoisted.wsInstances[0].emit('message', Buffer.from('not json'));

		expect(errored()).toContain('ignored an unparseable daemon message');
	});

	it('warns on a connection error without scheduling anything', async () => {
		await startWorker();
		hoisted.wsInstances[0].emit('error', new Error('boom'));

		expect(errored()).toContain('connection error: boom');
		expect(hoisted.reconnectTimers).toHaveLength(0);
	});

	it('schedules a reconnect on close, and the backoff timer opens a new connection', async () => {
		await startWorker();
		hoisted.wsInstances[0].emit('close');

		expect(logged()).toContain('daemon connection closed; next attempt in 500ms');
		expect(hoisted.reconnectTimers).toHaveLength(1);
		expect(hoisted.reconnectTimers[0]?.delay).toBe(500);

		hoisted.reconnectTimers[0]?.callback();
		expect(hoisted.wsInstances).toHaveLength(2);
	});

	it('reconnects with the url delivered by a nudge, and only once even if the timer fires later', async () => {
		await startWorker();
		hoisted.notifyCallbacks.length = 0;
		hoisted.wsInstances[0].emit('close');
		expect(hoisted.notifyCallbacks.length).toBeGreaterThan(0);

		hoisted.notifyCallbacks[hoisted.notifyCallbacks.length - 1]?.('ws://nudged:1234');
		expect(hoisted.wsUrls[hoisted.wsUrls.length - 1]).toBe('ws://nudged:1234');
		expect(hoisted.wsInstances).toHaveLength(2);

		hoisted.reconnectTimers[0]?.callback();
		expect(hoisted.wsInstances).toHaveLength(2);
	});

	it('keeps waiting (no exit) when the daemon url cannot be resolved', async () => {
		hoisted.resolveDaemonWsUrl = () => {
			throw new Error('daemon not up yet');
		};
		await startWorker();

		expect(hoisted.wsInstances).toHaveLength(0);
		expect(errored()).toContain('[wait] daemon not up yet');
		expect(hoisted.reconnectTimers).toHaveLength(1);
	});

	it('warns and continues when the nudge server cannot start', async () => {
		hoisted.nudgeStartError = new Error('port busy');
		await startWorker();

		expect(errored()).toContain('nudge server could not start, reconnect will rely on backoff only: port busy');
		expect(hoisted.wsInstances).toHaveLength(1);
	});

	it('executes an assignment: step_started, step_completed, then ready', async () => {
		executeMock.mockResolvedValue({ output: { a: 1 }, meta: undefined, io: undefined });
		await startWorker();
		const ws = hoisted.wsInstances[0];
		sendAssign(ws);
		await flush();

		expect(sentTypes(ws)).toEqual(['step_started', 'step_completed', 'ready']);
		const completed = JSON.parse(String(ws.send.mock.calls[1]?.[0])) as Record<string, unknown>;
		expect(completed['assignmentId']).toBe('assignment-1');
		expect(completed['output']).toEqual({ a: 1 });
		expect(hoisted.displayCalls[0]).toEqual([
			'stepStarted',
			'step-1',
			{ executionId: 'exec-1', stepName: 'My step', flowId: 'flow-1', flowVersion: 3 },
		]);
		expect(hoisted.displayCalls[1]).toEqual(['stepCompleted', 'step-1']);
	});

	it('forwards the meta of a failed attempt in step_failed', async () => {
		const meta = { duration_ms: 12, exit_code: 2, end_reason: 'exit_nonzero' };
		executeMock.mockRejectedValue(Object.assign(new Error('script failed'), { meta }));
		await startWorker();
		const ws = hoisted.wsInstances[0];
		sendAssign(ws);
		await flush();

		const failed = JSON.parse(String(ws.send.mock.calls[1]?.[0])) as Record<string, unknown>;
		expect(failed['type']).toBe('step_failed');
		expect(failed['meta']).toEqual(meta);
	});

	it('reports a failed assignment with the error details, then ready', async () => {
		executeMock.mockRejectedValue(
			Object.assign(new Error('step blew up'), {
				stepOutputs: { x: 1 },
				stdout: 'out',
				stderr: 'err',
				io: { input: 'i' },
			})
		);
		await startWorker();
		const ws = hoisted.wsInstances[0];
		sendAssign(ws);
		await flush();

		expect(sentTypes(ws)).toEqual(['step_started', 'step_failed', 'ready']);
		const failed = JSON.parse(String(ws.send.mock.calls[1]?.[0])) as Record<string, unknown>;
		expect(failed).toMatchObject({
			assignmentId: 'assignment-1',
			executionId: 'exec-1',
			stepId: 'step-1',
			error: 'step blew up',
			output: { x: 1 },
			stdout: 'out',
			stderr: 'err',
			io: { input: 'i' },
		});
		expect(hoisted.displayCalls[1]).toEqual(['stepFailed', 'step-1', 'step blew up']);
	});

	it('ignores idle, warns on the shutdown notice, and warns on an unknown message type', async () => {
		await startWorker();
		const ws = hoisted.wsInstances[0];
		ws.emit('message', Buffer.from(JSON.stringify({ type: 'idle' })));
		await flush();
		expect(errorSpy).not.toHaveBeenCalled();

		ws.emit('message', Buffer.from(JSON.stringify({ type: 'done' })));
		await flush();
		expect(errored()).toContain('received the shutdown notice meant for daemon-created workers; staying alive');

		ws.emit('message', Buffer.from(JSON.stringify({ type: 'mystery' })));
		await flush();
		expect(errored()).toContain('[warn] unknown daemon message: {"type":"mystery"}');
		expect(ws.send).not.toHaveBeenCalled();
	});

	it('explains that no approval plugin is configured when the worker cannot answer checkpoints', async () => {
		await startWorker();

		expect(logged()).toContain('can-answer-checkpoints: false (no approval plugin configured');
	});

	it('explains that the configured approval plugin needs a terminal', async () => {
		hoisted.approval = { requiresTerminal: true };
		await startWorker();

		expect(logged()).toContain('(the configured approval plugin needs a terminal and this is not one');
		expect(logged()).toContain('plugins.file-approval answers from a file instead)');
	});

	it('prints no explanation when the worker can answer checkpoints', async () => {
		hoisted.approval = {};
		hoisted.hasUserInterface = true;
		await startWorker();

		expect(logged()).toMatch(/can-answer-checkpoints: true$/m);
	});

	it('prints labels, projects, the interactive opt-in and the verbose hint', async () => {
		await startWorker(['--interactive']);

		expect(logged()).toContain('labels     : label-a');
		expect(logged()).toContain('projects   : fake (fake0001)');
		expect(logged()).toContain('model-step-interactive: true');
		expect(logged()).toContain('Run with --verbose to also see the raw output each step produces.');
	});

	it('prints the opt-in hint and omits the verbose hint under --verbose', async () => {
		await startWorker(['--verbose']);

		expect(logged()).toContain('model-step-interactive: false (pass --interactive to opt in)');
		expect(logged()).not.toContain('Run with --verbose');
	});

	it('prints the registry line when the self declaration was recorded', async () => {
		hoisted.declarationSourceId = 'self-1';
		await startWorker();

		expect(logged()).toContain('registry   : declared as "self-1" while this process lives');
	});

	it('prints the retry notice when the self declaration could not be recorded yet', async () => {
		await startWorker();

		expect(logged()).toContain('registry   : could not record itself yet -- retrying in the background');
	});

	it('fails loudly on a detected update when process.argv[1] is unset', async () => {
		const originalArgv1 = process.argv[1];
		await startWorker();
		hoisted.cache = { lastCheckedAt: 1, latestVersion: '9999.99.99' };
		process.argv[1] = undefined as unknown as string;
		try {
			expect(() => {
				for (const callback of hoisted.intervalCallbacks) {
					callback();
				}
			}).toThrow('Cannot self re-exec: process.argv[1] is unset');
		} finally {
			process.argv[1] = originalArgv1 as string;
		}
	});
});
