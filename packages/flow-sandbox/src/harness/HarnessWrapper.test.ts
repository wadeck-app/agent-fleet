import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { FakeScheduler } from '../FakeScheduler';
import { RunMounts } from '../RunMounts';
import { SandboxCapacity } from '../SandboxCapacity';
import { SandboxError } from '../SandboxError';
import { SandboxLifecycle } from '../SandboxLifecycle';
import { ObservedList } from '../testing/ObservedList';
import { RecordingPresence } from '../testing/RecordingPresence';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { BRIDGE_TOKEN_HEADER, BridgeTokenGuard } from './BridgeTokenGuard';
import { HarnessBridge } from './HarnessBridge';
import type { JsonObject } from './HarnessMessages';
import { type DaemonControl, type DaemonHandlers, HarnessWrapper } from './HarnessWrapper';
import type { InnerWorkerHandle, InnerWorkerLaunch, InnerWorkerLauncher } from './InnerWorkerLauncher';
import { RelayRegistration } from './RelayRegistration';
import type { PreparedSandbox, SandboxPreparer } from './SandboxPreparer';

const TOKEN = 'k'.repeat(40);
const MINUTE = 60_000;

/** The daemon as seen by the wrapper: records what it receives, lets the test speak. */
class FakeDaemon implements DaemonControl {
	/** What the wrapper sent, awaitable: `arrivals.waitFor(...)` resolves in the turn of the message that matters. */
	readonly arrivals = new ObservedList<JsonObject>();
	handlers: DaemonHandlers | undefined;
	connected = false;
	closed = false;

	get received(): JsonObject[] {
		return this.arrivals.items;
	}

	connect(): Promise<void> {
		this.connected = true;
		return Promise.resolve();
	}

	send(message: JsonObject): void {
		this.arrivals.push(message);
	}

	close(): void {
		this.closed = true;
	}

	types(): string[] {
		return this.received.map(message => String(message['type']));
	}
}

/** Behaviour of the simulated inner worker for one assign. */
type InnerBehaviour = (assign: JsonObject, send: (message: unknown) => void, socket: WebSocket) => void;

/** Stands for `sbx exec node /opt/flow/inner-bridge.cjs`: dials the bridge like the shim does. */
class FakeLauncher implements InnerWorkerLauncher {
	readonly launches: InnerWorkerLaunch[] = [];
	readonly assigns: JsonObject[] = [];
	behaviour: InnerBehaviour = defaultBehaviour;
	socket: WebSocket | undefined;
	connectWithToken: string | undefined = TOKEN;
	/**
	 * When the worker sends its first `ready`: `auto` right after the connection, `manual` when the test calls
	 * `register()`, `never` = the worker connects but never registers.
	 */
	registration: 'auto' | 'manual' | 'never' = 'auto';
	/** Every socket opened to the bridge, awaitable. */
	readonly opened = new ObservedList<WebSocket>();
	private port = 0;

	/** The worker's first `ready` (its registration), by hand. */
	register(): void {
		if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('The fake worker has no open connection.');
		this.socket.send(JSON.stringify({ type: 'ready', pid: 1, labels: ['evil'] }));
	}

	setPort(port: number): void {
		this.port = port;
	}

	launch(request: InnerWorkerLaunch): InnerWorkerHandle {
		this.launches.push(request);
		let resolveExit: (value: { exitCode: number | undefined }) => void = () => undefined;
		const exited = new Promise<{ exitCode: number | undefined }>(resolve => (resolveExit = resolve));
		if (this.connectWithToken === undefined) {
			resolveExit({ exitCode: 1 });
			return { exited, stop: () => undefined };
		}
		const socket = new WebSocket(`ws://127.0.0.1:${this.port}/`, {
			headers: { [BRIDGE_TOKEN_HEADER]: this.connectWithToken },
		});
		this.socket = socket;
		socket.on('error', () => undefined);
		socket.on('open', () => {
			this.opened.push(socket);
			if (this.registration === 'auto') this.register();
		});
		socket.on('close', () => resolveExit({ exitCode: 0 }));
		socket.on('message', data => {
			const assign = JSON.parse(data.toString()) as JsonObject;
			this.assigns.push(assign);
			this.behaviour(assign, message => socket.send(JSON.stringify(message)), socket);
		});
		return { exited, stop: () => socket.terminate() };
	}
}

function scopedTo(assign: JsonObject, type: string, extra: JsonObject = {}): JsonObject {
	const context = assign['executionContext'] as JsonObject;
	return {
		type,
		assignmentId: assign['assignmentId'],
		executionId: context['executionId'],
		stepId: assign['stepId'],
		...extra,
	};
}

const defaultBehaviour: InnerBehaviour = (assign, send) => {
	send(scopedTo(assign, 'step_started'));
	send(scopedTo(assign, 'log', { entry: { message: 'hello from the VM' } }));
	send(scopedTo(assign, 'step_completed', { output: { stdout: 'ok' }, meta: { exit_code: 0 } }));
	send({ type: 'ready', pid: 1 });
};

let root: string;
let log: RecordingSandboxLog;
let runtime: FakeSandboxRuntime;
let scheduler: FakeScheduler;
let presence: RecordingPresence;
let lifecycle: SandboxLifecycle;
let daemon: FakeDaemon;
let launcher: FakeLauncher;
let prepared: number;
let prepareFailure: Error | undefined;
/** One entry per `onFinished` call of the wrapper. */
let finished: ObservedList<true>;
let wrapper: HarnessWrapper;
let tokens: BridgeTokenGuard;

const preparer: SandboxPreparer = {
	prepare: (): Promise<PreparedSandbox> => {
		if (prepareFailure !== undefined) return Promise.reject(prepareFailure);
		prepared += 1;
		return Promise.resolve({
			envFor: (type): Record<string, string> => (type === 'model' ? { MODEL_ONLY: '1' } : {}),
			innerEnv: { FLOW_BRIDGE_URL: 'ws://host.docker.internal:1/', FLOW_BRIDGE_TOKEN: 'flow-ph-fake' },
			detach: () => Promise.resolve(),
		});
	},
};

/** A fresh world (fakes, wrapper started). A test that needs other timeouts stops the default one and starts its own. */
async function startWorld(
	timeouts: { innerConnectTimeoutMs: number } = { innerConnectTimeoutMs: 2000 }
): Promise<void> {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-wrapper-')));
	log = new RecordingSandboxLog();
	const clock = new FakeClock(Date.UTC(2026, 9, 27));
	runtime = new FakeSandboxRuntime({ clock });
	scheduler = new FakeScheduler(clock);
	presence = new RecordingPresence();
	lifecycle = new SandboxLifecycle(
		{ wrapperId: 'h1', agent: 'claude', cpus: 2, memory: '2g', idleStopMinutes: 5 },
		{ runtime, scheduler, log, capacity: new SandboxCapacity(runtime, 4), presence }
	);
	daemon = new FakeDaemon();
	launcher = new FakeLauncher();
	prepared = 0;
	prepareFailure = undefined;
	const ownFinished = new ObservedList<true>();
	finished = ownFinished;
	tokens = new BridgeTokenGuard();
	tokens.expect(TOKEN);
	wrapper = new HarnessWrapper({
		registration: new RelayRegistration({
			attachedProjectIds: ['ab12cd34'],
			labels: ['sandbox'],
			authToken: 'launch-token',
			sourceId: 'sbx',
			pid: 1,
			version: 'test',
		}),
		lifecycle,
		preparer,
		launcher,
		log,
		createBridge: handlers => new HarnessBridge({ tokens, log, ...handlers }),
		createDaemon: handlers => {
			daemon.handlers = handlers;
			return daemon;
		},
		createMounts: (workspaceDir, workspaceMetaDir) =>
			new RunMounts({ workspaceDir, workspaceMetaDir, platform: process.platform, log }),
		now: () => Date.now(),
		onFinished: () => ownFinished.push(true),
		innerConnectTimeoutMs: timeouts.innerConnectTimeoutMs,
		innerFreeTimeoutMs: 500,
	});
	await wrapper.start();
	// The bridge port is only known after start.
	launcher.setPort(bridgePort());
}

async function stopWorld(): Promise<void> {
	await wrapper.shutdown('test end');
	fs.rmSync(root, { recursive: true, force: true });
}

beforeEach(async () => {
	await startWorld();
});

afterEach(async () => {
	await stopWorld();
});

/** The wrapper owns the bridge; its port is in the first log line. */
function bridgePort(): number {
	const match = /bridge listening on 127\.0\.0\.1:(\d+)/.exec(log.text());
	if (match?.[1] === undefined) throw new Error('bridge port not found in the log');
	return Number(match[1]);
}

function workspaces(name: string): { workspaceDir: string; outputsDir: string } {
	const workspaceDir = path.join(root, name);
	fs.mkdirSync(workspaceDir, { recursive: true });
	fs.mkdirSync(path.join(`${workspaceDir}.meta`, 'outputs'), { recursive: true });
	return { workspaceDir, outputsDir: path.join(`${workspaceDir}.meta`, 'outputs') };
}

function assign(
	overrides: { step?: JsonObject; run?: string; stepId?: string; assignmentId?: string } = {}
): JsonObject {
	const run = overrides.run ?? 'run1';
	return {
		type: 'assign',
		assignmentId: overrides.assignmentId ?? 'as1',
		stepId: overrides.stepId ?? 'build',
		stepConfig: { id: overrides.stepId ?? 'build', type: 'script', script: 'echo hi', ...overrides.step },
		executionContext: {
			executionId: run,
			inputs: {},
			stepOutputs: {},
			stepMeta: {},
			cwd: root,
			...workspaces(`ws-${run}`),
		},
	};
}

function send(message: JsonObject): void {
	daemon.handlers?.onMessage(message);
}

/** Waits for the `ready` that ends the assignment (the first `ready` is the registration). */
async function serve(message: JsonObject, expectedReadyCount: number): Promise<void> {
	send(message);
	await daemon.arrivals.waitFor(
		messages => messages.filter(candidate => candidate['type'] === 'ready').length >= expectedReadyCount
	);
}

describe('HarnessWrapper registration', () => {
	it('registers with the daemon: the wrapper-built ready, labels including sandbox', () => {
		expect(daemon.connected).toBe(true);
		expect(daemon.received[0]).toMatchObject({
			type: 'ready',
			sourceId: 'sbx',
			labels: ['sandbox'],
			attachedProjectIds: ['ab12cd34'],
			authToken: 'launch-token',
		});
	});
});

describe('HarnessWrapper relaying a step', () => {
	it('creates one sandbox, runs the inner worker, forwards the report and announces the wrapper as free', async () => {
		await serve(assign(), 2);

		expect(daemon.types()).toEqual(['ready', 'step_started', 'log', 'step_completed', 'ready']);
		expect(daemon.received[3]).toMatchObject({
			assignmentId: 'as1',
			executionId: 'run1',
			stepId: 'build',
			output: { stdout: 'ok' },
		});
		expect(runtime.callsTo('create')).toHaveLength(1);
		expect(runtime.has('flow-sbx-h1-run1')).toBe(true);
		expect(launcher.launches).toEqual([
			{
				sandbox: 'flow-sbx-h1-run1',
				env: { FLOW_BRIDGE_URL: 'ws://host.docker.internal:1/', FLOW_BRIDGE_TOKEN: 'flow-ph-fake' },
			},
		]);
		expect(log.text()).toContain('timing {');
	});

	it('does not forward the registration the inner worker sent, nor anything it says about itself', async () => {
		await serve(assign(), 2);

		const readies = daemon.received.filter(message => message['type'] === 'ready');
		expect(readies).toHaveLength(2);
		for (const ready of readies) {
			expect(ready['labels']).toEqual(['sandbox']);
			expect(ready['authToken']).toBe('launch-token');
		}
	});

	it('sends the inner worker the rewritten assign: sandbox paths and the injected env', async () => {
		const message = assign({ step: { type: 'model', prompt: 'p' } });

		await serve(message, 2);

		const received = launcher.assigns[0] as JsonObject;
		const context = received['executionContext'] as JsonObject;
		const hostWorkspace = (message['executionContext'] as JsonObject)['workspaceDir'] as string;
		expect(context['workspaceDir']).toBe(
			new RunMounts({
				workspaceDir: hostWorkspace,
				workspaceMetaDir: `${hostWorkspace}.meta`,
				platform: process.platform,
				log,
			}).toSandboxPath(hostWorkspace, 'x')
		);
		expect((received['stepConfig'] as JsonObject)['env']).toEqual({ MODEL_ONLY: '1' });
	});

	it('prepares the sandbox once and reuses the inner worker for the next step of the run', async () => {
		await serve(assign(), 2);
		await serve(assign({ stepId: 'second', assignmentId: 'as2' }), 3);

		expect(prepared).toBe(1);
		expect(launcher.launches).toHaveLength(1);
		expect(runtime.callsTo('create')).toHaveLength(1);
		expect(daemon.types().filter(type => type === 'step_completed')).toHaveLength(2);
	});

	it('restarts the sandbox after the idle stop and launches the inner worker again', async () => {
		await serve(assign(), 2);
		const innerSocket = launcher.socket;
		if (innerSocket === undefined) throw new Error('The fake worker never connected.');
		const innerClosed = once(innerSocket, 'close');
		innerSocket.close();
		await innerClosed;
		scheduler.advance(5 * MINUTE);
		await lifecycle.whenSettled();
		expect(lifecycle.current()?.status).toBe('stopped');

		await serve(assign({ stepId: 'second', assignmentId: 'as2' }), 3);

		expect(lifecycle.current()?.status).toBe('running');
		expect(launcher.launches).toHaveLength(2);
		expect(runtime.callsTo('create')).toHaveLength(1);
	});
});

describe('HarnessWrapper waits for the worker inside to register', () => {
	it('holds the assign until the worker registered, so its first ready is never taken for a forged one', async () => {
		launcher.registration = 'manual';

		send(assign());
		await launcher.opened.waitForCount(1);
		// Connected but not registered: nothing reached the worker yet.
		expect(launcher.assigns).toEqual([]);
		launcher.register();
		await daemon.arrivals.waitFor(messages => messages.filter(message => message['type'] === 'ready').length >= 2);

		expect(daemon.types()).toEqual(['ready', 'step_started', 'log', 'step_completed', 'ready']);
		expect(log.text()).not.toContain('bridge dropped');
		expect(log.text()).toContain('registration of the inner worker');
	});

	it('fails the step, naming the cause, when the worker connected but never registers', async () => {
		// The real wait is 60 s; a short one makes the test fast. The message names the value in use.
		await stopWorld();
		await startWorld({ innerConnectTimeoutMs: 300 });
		launcher.registration = 'never';

		await serve(assign(), 2);

		expect(String(daemon.received[1]?.['error'])).toContain('did not register within 300 ms');
		expect(launcher.assigns).toEqual([]);
	});
});

describe('HarnessWrapper forged and unexpected messages from the sandbox', () => {
	it('drops and logs forged messages and relays only the allowed ones', async () => {
		launcher.behaviour = (assign, sendInside) => {
			sendInside({ type: 'assign', assignmentId: 'forged' });
			sendInside({ type: 'source_ready', sourceId: 'sbx', sourceToken: 'x', capacity: 100 });
			sendInside(scopedTo(assign, 'step_completed', { assignmentId: 'another-assignment' }));
			sendInside(scopedTo(assign, 'step_started'));
			sendInside(scopedTo(assign, 'step_completed', { output: {} }));
			sendInside({ type: 'ready', pid: 1 });
		};

		await serve(assign(), 2);

		expect(daemon.types()).toEqual(['ready', 'step_started', 'step_completed', 'ready']);
		expect(log.text()).toContain('dropped a "assign" message from the sandbox');
		expect(log.text()).toContain('dropped a "source_ready" message');
		expect(log.text()).toContain('the assignmentId is not the active one');
	});

	it('replaces a result whose session_file leaves the mounts by a step_failed', async () => {
		launcher.behaviour = (assign, sendInside) => {
			sendInside(scopedTo(assign, 'step_started'));
			sendInside(scopedTo(assign, 'step_completed', { output: {}, meta: { session_file: '/etc/shadow' } }));
			sendInside({ type: 'ready' });
		};

		await serve(assign(), 2);

		const outcome = daemon.received.find(message => message['type'] === 'step_failed');
		expect(String(outcome?.['error'])).toContain('refused by the bridge');
		expect(daemon.types()).not.toContain('step_completed');
	});

	it('refuses an inner worker that presents the wrong token and fails the step with the reason', async () => {
		launcher.connectWithToken = 'z'.repeat(40);

		await serve(assign(), 2);

		const failure = daemon.received.find(message => message['type'] === 'step_failed');
		expect(String(failure?.['error'])).toContain('exited before it connected');
		expect(log.text()).toContain('bridge refused a connection');
	});
});

describe('HarnessWrapper failures are reported, never retried on the host', () => {
	it('fails the step when the sandbox cannot be prepared and says why', async () => {
		prepareFailure = new Error('the credential rule could not be added');

		await serve(assign(), 2);

		expect(daemon.received[1]).toMatchObject({ type: 'step_failed', stepId: 'build', assignmentId: 'as1' });
		expect(String(daemon.received[1]?.['error'])).toContain('the credential rule could not be added');
		expect(launcher.launches).toHaveLength(0);
		expect(daemon.types().at(-1)).toBe('ready');
	});

	it('fails the step when the sandbox cannot be created', async () => {
		runtime.failNext('create', new SandboxError('command-failed', 'no space left'));

		await serve(assign(), 2);

		expect(String(daemon.received[1]?.['error'])).toContain('no space left');
	});

	it('fails a user_intervention step without touching the sandbox state beyond its creation, naming the reason', async () => {
		await serve(assign({ step: { type: 'user_intervention' } }), 2);

		expect(String(daemon.received[1]?.['error'])).toContain('only "model" and "script" steps');
	});

	it('fails the step when the inner worker disconnects before reporting an outcome', async () => {
		launcher.behaviour = (assign, sendInside, socket) => {
			sendInside(scopedTo(assign, 'step_started'));
			socket.terminate();
		};

		await serve(assign(), 2);

		expect(daemon.types()).toEqual(['ready', 'step_started', 'step_failed', 'ready']);
		expect(String(daemon.received[2]?.['error'])).toContain('disconnected during step "build"');
	});

	it('fails a step of another run while one is held (worker-busy), naming both', async () => {
		await serve(assign(), 2);

		await serve(assign({ run: 'run2', assignmentId: 'as9' }), 3);

		const failure = daemon.received.find(message => message['type'] === 'step_failed');
		expect(String(failure?.['error'])).toContain('run1');
		expect(String(failure?.['error'])).toContain('run2');
		expect(runtime.callsTo('create')).toHaveLength(1);
	});

	it('ignores idle, a daemon "done" and unknown messages, logging the last two', () => {
		send({ type: 'idle' });
		send({ type: 'done' });
		send({ type: 'mystery' });

		expect(log.text()).toContain('"done"');
		expect(log.text()).toContain('unknown daemon message');
	});

	it('refuses an assign without ids and does nothing', async () => {
		send({ type: 'assign', stepId: 's' });

		await log.waitForText('refused an "assign"');
		expect(runtime.callsTo('create')).toHaveLength(0);
	});
});

describe('HarnessWrapper when the daemon goes away', () => {
	it('stops the sandbox and keeps it (daemon_stopping), then reports the end', async () => {
		await serve(assign(), 2);

		daemon.handlers?.onClosed(1006, '');
		await finished.waitForCount(1);
		expect(finished.length).toBe(1);

		expect(runtime.callsTo('remove')).toHaveLength(0);
		expect(runtime.state('flow-sbx-h1-run1').status).toBe('stopped');
		expect(presence.events.at(-1)).toBe('withdraw:h1');
		expect(log.text()).toContain('stopped and kept');
	});

	it('shutdown is idempotent and removes nothing', async () => {
		await serve(assign(), 2);

		await wrapper.shutdown('first');
		await wrapper.shutdown('second');

		expect(runtime.callsTo('remove')).toHaveLength(0);
		expect(runtime.callsTo('stop')).toHaveLength(1);
	});
});
