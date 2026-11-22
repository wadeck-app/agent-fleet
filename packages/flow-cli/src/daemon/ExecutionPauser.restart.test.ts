/**
 * A paused run survives a daemon restart (D13): pause on one daemon, restart = a fresh ExecutionStore, WorkerRegistry and
 * CommandHandler over the SAME executions directory (the memory of the first daemon is gone), restore, `flow unpause`.
 * REAL FlowScheduler, ExecutionStore (temp dir), WorkerRegistry (fake sockets); only the log writer and the workspace provider are stubs.
 */
import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { ExecutionStore } from '../storage/ExecutionStore';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import type { CommandHandler } from './CommandHandler';
import { TrackedCommandHandler, registerFolderAsProject } from './CommandHandlerTestHarness';
import type { DaemonRuntime } from './DaemonRuntime';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';
import { WorkerRegistry } from './WorkerRegistry';

const HEADER = `\
version: "1.0.0"
name: Restart Flow
description: x
workspace: in-place
inputs: {}
`;

const CHAIN_FLOW = `id: chain-flow\n${HEADER}steps:
  - id: s1
    name: S1
    type: script
    script: echo one
  - id: s2
    name: S2
    type: script
    script: echo two
    depends: [s1]
  - id: s3
    name: S3
    type: script
    script: echo three
    depends: [s2]
`;

type FakeSocket = WebSocket & { send: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };

interface Daemon {
	store: ExecutionStore;
	registry: WorkerRegistry;
	handler: CommandHandler;
	messages: DaemonWorkerMessageHandler;
}

describe('a paused run survives a daemon restart', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let provider: {
		allocate: ReturnType<typeof vi.fn>;
		release: ReturnType<typeof vi.fn>;
		adopt?: ReturnType<typeof vi.fn>;
	};
	let daemons: Daemon[];
	let flowCounter = 0;

	const executionsDir = (): string => path.join(tmpDir, 'executions');

	/** One daemon process: nothing is shared with another except the files in `tmpDir`. */
	function boot(): Daemon {
		const store = new ExecutionStore(executionsDir());
		const registry = new WorkerRegistry();
		const logWriter = { write: vi.fn(), writeExecution: vi.fn() };
		const handler = new TrackedCommandHandler(
			path.join(tmpDir, 'daemon'),
			registry,
			{
				canProvision: () => false,
				planProvisioning: () => ({ fork: 0 }),
				provision: vi.fn(),
				registerWorker: vi.fn(),
			} as never,
			undefined,
			store,
			logWriter as never,
			false,
			undefined,
			undefined,
			new FixedWorkspaceProviders(provider as never),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			{ enabled: true, ackTimeoutMs: 50 },
			{ notifyRunEnded: vi.fn().mockResolvedValue(undefined) } as never
		);
		const messages = new DaemonWorkerMessageHandler(
			path.join(tmpDir, 'logs'),
			() =>
				({
					commandHandler: handler,
					workerRegistry: registry,
					relayRegistry: { remove: vi.fn() },
					executionStore: store,
					logWriter,
					daemonSecrets: { masks: { mask: (_id: string, text: string) => text } },
				}) as unknown as DaemonRuntime,
			() => {}
		);
		const daemon = { store, registry, handler, messages };
		daemons.push(daemon);
		return daemon;
	}

	/** The restart: the old daemon is gone, a new one starts, reconciles and restores, as `Daemon.ts` does. */
	async function restart(old: Daemon): Promise<Daemon> {
		old.handler.stopBackgroundWork();
		const fresh = boot();
		fresh.store.reconcileInterruptedExecutions();
		await fresh.handler.restorePausedExecutions(() => undefined);
		return fresh;
	}

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paused-restart-'));
		const registered = await registerFolderAsProject(tmpDir);
		disposeProject = registered.dispose;
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		fs.mkdirSync(executionsDir(), { recursive: true });
		const handle = { path: path.join(tmpDir, 'plugin-ws'), id: 'p:1' };
		provider = {
			allocate: vi.fn().mockResolvedValue(handle),
			release: vi.fn().mockResolvedValue(undefined),
			adopt: vi.fn().mockImplementation(async (request: { handle: unknown }) => request.handle),
		};
		daemons = [];
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		for (const daemon of daemons) {
			daemon.handler.stopBackgroundWork();
		}
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function start(daemon: Daemon, yaml: string): Promise<string> {
		const flowFile = path.join(tmpDir, `flow-${String(flowCounter++)}.yml`);
		fs.writeFileSync(flowFile, yaml);
		const result = await daemon.handler.handleRun(
			{ type: 'run', flowFile, cwd: tmpDir } as never,
			{ dispatch: vi.fn().mockResolvedValue(undefined) } as unknown as HookDispatcher
		);
		if (result.type !== 'execution_started') {
			throw new Error(`run was refused: ${JSON.stringify(result)}`);
		}
		return result.executionId;
	}

	function connect(daemon: Daemon): FakeSocket {
		const ws = {
			readyState: 1,
			OPEN: 1,
			send: vi.fn(),
			terminate: vi.fn(),
			close: vi.fn(),
		} as unknown as FakeSocket;
		daemon.registry.register(ws, { pid: 1, sourceId: 'sbx-source', features: [] }, { ephemeral: true });
		return ws;
	}

	function assignmentsOf(ws: FakeSocket, stepId: string): number {
		return ws.send.mock.calls
			.map(call => JSON.parse(String(call[0])) as { type: string; stepId?: string })
			.filter(message => message.type === 'assign' && message.stepId === stepId).length;
	}

	function complete(daemon: Daemon, ws: FakeSocket, executionId: string, stepId: string): void {
		const sent = ws.send.mock.calls
			.map(call => JSON.parse(String(call[0])) as { type: string; stepId?: string; assignmentId?: string })
			.find(message => message.type === 'assign' && message.stepId === stepId);
		if (sent?.assignmentId === undefined) {
			throw new Error(`no assignment of ${stepId} was written to the worker`);
		}
		daemon.registry.markIdle(ws);
		daemon.messages.handleMessage(ws, {
			type: 'step_completed',
			assignmentId: sent.assignmentId,
			executionId,
			stepId,
			output: { out: stepId },
		} as never);
	}

	const pause = (daemon: Daemon, id: string, reason?: string) =>
		daemon.handler.handlePause({ type: 'pause', executionId: id, ...(reason === undefined ? {} : { reason }) });
	const unpause = (daemon: Daemon, id: string) => daemon.handler.handleUnpause({ type: 'unpause', executionId: id });
	const snapshotFile = (id: string): string => path.join(executionsDir(), `${id}.paused-snapshot`);

	it('restores the run paused; unpause continues it: completed steps are not re-run, the lost step is a new attempt, nothing is dispatched twice', async () => {
		const before = boot();
		const oldWorker = connect(before);
		const id = await start(before, CHAIN_FLOW);
		complete(before, oldWorker, id, 's1');
		// s2 is running on the old worker when the pause is asked
		expect(assignmentsOf(oldWorker, 's2')).toBe(1);

		const paused = pause(before, id, 'wait for the review');

		expect(paused).toMatchObject({ type: 'execution_paused', restartSafe: true });
		expect(fs.existsSync(snapshotFile(id))).toBe(true);

		const after = await restart(before);

		// Restored: still running and paused, nothing failed
		const restored = after.store.read(id);
		expect(restored).toMatchObject({ status: 'running', paused: { reason: 'wait for the review' } });
		expect(restored.steps['s1']?.status).toBe('completed');
		// The step that was running lost its worker: a new attempt, visible in the history
		expect(restored.steps['s2']?.status).toBe('pending');
		expect(restored.steps['s2']?.attemptLog).toMatchObject([
			{ n: 1, outcome: 'abandoned', endReason: 'worker_lost' },
		]);
		expect(provider.adopt).toHaveBeenCalledTimes(1);
		// A worker of the new daemon gets nothing while the run is paused
		const newWorker = connect(after);
		expect(assignmentsOf(newWorker, 's1')).toBe(0);
		expect(assignmentsOf(newWorker, 's2')).toBe(0);
		// Paused again answers: it is paused, not "gone with a previous daemon"
		expect(pause(after, id)).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_PAUSED' });

		expect(unpause(after, id)).toMatchObject({ type: 'execution_unpaused', executionId: id });

		expect(assignmentsOf(newWorker, 's1')).toBe(0);
		expect(assignmentsOf(newWorker, 's2')).toBe(1);
		expect(after.store.read(id).steps['s2']).toMatchObject({ status: 'running', attempts: 2 });
		expect(after.store.read(id).steps['s2']?.attemptLog?.[0]?.endReason).toBe('worker_lost');
		expect(fs.existsSync(snapshotFile(id))).toBe(false);
		// The outputs of s1 are still available to the later steps
		complete(after, newWorker, id, 's2');
		expect(assignmentsOf(newWorker, 's3')).toBe(1);
		complete(after, newWorker, id, 's3');
		expect(after.store.read(id).status).toBe('completed');
		expect(assignmentsOf(newWorker, 's2')).toBe(1);
		expect(assignmentsOf(newWorker, 's1')).toBe(0);
	});

	it('keeps a step that finished while paused: it is not re-run, and the step it released is dispatched once', async () => {
		const before = boot();
		const oldWorker = connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);
		// s1 finishes while the run is paused: s2 becomes ready but is held back
		complete(before, oldWorker, id, 's1');
		expect(assignmentsOf(oldWorker, 's2')).toBe(0);

		const after = await restart(before);

		const newWorker = connect(after);
		expect(after.store.read(id).steps['s1']?.status).toBe('completed');
		expect(assignmentsOf(newWorker, 's2')).toBe(0);
		unpause(after, id);
		expect(assignmentsOf(newWorker, 's1')).toBe(0);
		expect(assignmentsOf(newWorker, 's2')).toBe(1);
		complete(after, newWorker, id, 's2');
		complete(after, newWorker, id, 's3');
		expect(after.store.read(id).status).toBe('completed');
	});

	it('survives a second restart before the unpause', async () => {
		const first = boot();
		connect(first);
		const id = await start(first, CHAIN_FLOW);
		pause(first, id);

		const second = await restart(first);
		const third = await restart(second);

		expect(third.store.read(id)).toMatchObject({ status: 'running', paused: {} });
		const worker = connect(third);
		unpause(third, id);
		expect(assignmentsOf(worker, 's1')).toBe(1);
	});

	it('does not persist a run whose workspace provider cannot take its workspace back, and says so; the restart then fails it explicitly', async () => {
		delete provider.adopt;
		const before = boot();
		connect(before);
		const id = await start(before, CHAIN_FLOW);

		const paused = pause(before, id);

		expect(paused).toMatchObject({ type: 'execution_paused', restartSafe: false });
		expect((paused as { restartNote: string }).restartNote).toMatch(
			/cannot take a workspace back after a daemon restart/
		);
		expect(fs.existsSync(snapshotFile(id))).toBe(false);

		const after = await restart(before);

		const record = after.store.read(id);
		expect(record.status).toBe('failed');
		expect(record.lastError).toMatch(/while this execution was paused.*could not be restored.*flow run /s);
	});

	it('fails the run with an actionable message when the workspace cannot be taken back, and removes the snapshot', async () => {
		const before = boot();
		connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);
		provider.adopt!.mockRejectedValue(new Error('Pool slot "ws-1" is held by execution zzzz9999.'));

		const after = await restart(before);

		const record = after.store.read(id);
		expect(record.status).toBe('failed');
		expect(record.lastError).toContain('could not be restored after the daemon restarted');
		expect(record.lastError).toContain('held by execution zzzz9999');
		expect(record.lastError).toContain('Run it again with: flow run ');
		expect(fs.existsSync(snapshotFile(id))).toBe(false);
		expect(after.handler.hasActiveExecutions()).toBe(false);
	});

	it('fails a run whose snapshot is corrupt or of an unknown version, saying which', async () => {
		const before = boot();
		connect(before);
		const corrupt = await start(before, CHAIN_FLOW);
		const unknown = await start(before, CHAIN_FLOW);
		pause(before, corrupt);
		pause(before, unknown);
		fs.writeFileSync(
			snapshotFile(corrupt),
			'{ "version": 1, "executionId": "' + corrupt + '", "payload": { "run": 3 } }'
		);
		const written = JSON.parse(fs.readFileSync(snapshotFile(unknown), 'utf8')) as { version: number };
		fs.writeFileSync(snapshotFile(unknown), JSON.stringify({ ...written, version: 7 }));

		const after = await restart(before);

		expect(after.store.read(corrupt).lastError).toMatch(
			/snapshot .* is damaged: "run" is missing or not an object/
		);
		expect(after.store.read(unknown).lastError).toMatch(/has version 7, this daemon reads version 1/);
		expect(after.store.read(corrupt).status).toBe('failed');
		expect(after.store.read(unknown).status).toBe('failed');
	});

	it('fails a run whose scheduler snapshot is damaged before touching its workspace', async () => {
		const before = boot();
		connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);
		const file = JSON.parse(fs.readFileSync(snapshotFile(id), 'utf8')) as {
			payload: { scheduler: { completedSteps: unknown } };
		};
		file.payload.scheduler.completedSteps = 'oops';
		fs.writeFileSync(snapshotFile(id), JSON.stringify(file));

		const after = await restart(before);

		expect(after.store.read(id).lastError).toMatch(/"completedSteps" must be a list of strings/);
		expect(provider.adopt).not.toHaveBeenCalled();
	});

	it('removes the snapshot when the run is cancelled while paused', async () => {
		const before = boot();
		connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);
		expect(fs.existsSync(snapshotFile(id))).toBe(true);

		before.handler.handleCancel({ type: 'cancel', executionId: id } as never);

		expect(fs.existsSync(snapshotFile(id))).toBe(false);
	});

	it('removes the snapshot at the unpause: a running run is not persisted', async () => {
		const before = boot();
		connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);

		unpause(before, id);

		expect(fs.existsSync(snapshotFile(id))).toBe(false);
	});

	it('keeps a run that grows too big out of the restart, loudly: no snapshot is left that would restore an older state', async () => {
		const before = boot();
		const oldWorker = connect(before);
		const id = await start(before, CHAIN_FLOW);
		pause(before, id);
		expect(fs.existsSync(snapshotFile(id))).toBe(true);
		// The next refresh finds the state over the limit
		vi.spyOn(before.store.pausedSnapshots, 'write').mockImplementation(() => {
			throw new Error(
				'the snapshot of the run is 40.0 MiB, the limit is 32 MiB (step outputs are kept whole, never cut)'
			);
		});

		complete(before, oldWorker, id, 's1');

		// No stale snapshot is left (it would restore s1 as not done), the log says the run no longer survives, and the run is not retried
		expect(fs.existsSync(snapshotFile(id))).toBe(false);
		const writes = vi.mocked(before.store.pausedSnapshots.write).mock.calls.length;
		unpause(before, id);
		complete(before, oldWorker, id, 's2');
		expect(vi.mocked(before.store.pausedSnapshots.write).mock.calls.length).toBe(writes);
	});
});
