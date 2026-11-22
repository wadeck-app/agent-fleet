/**
 * `CommandHandler.handlePause` and `handleUnpause` (ExecutionPauser) end to end on the daemon side: REAL FlowScheduler, ExecutionStore
 * (temp dir), WorkerRegistry (fake sockets) and CommandHandler; only the log writer and the workspace provider are stubs.
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
import { DaemonIdleShutdown } from './DaemonIdleShutdown';
import type { DaemonRuntime } from './DaemonRuntime';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';
import { WorkerRegistry } from './WorkerRegistry';

const HEADER = `\
version: "1.0.0"
name: Cancel Flow
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
`;

const APPROVAL_FLOW = `id: approval-flow\n${HEADER}steps:
  - id: s1
    name: S1
    type: script
    script: echo one
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    depends: [s1]
    approval:
      title: Approve
      description: Please review
`;

type FakeSocket = WebSocket & { send: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };

const UNANSWERED = 'user_intervention timed out: this step is unanswered, not denied';

describe('CommandHandler.handlePause and handleUnpause -- hold back the new steps of one execution', () => {
	let tmpDir: string;
	let disposeProject: () => void;
	let projectId: string;
	let store: ExecutionStore;
	let registry: WorkerRegistry;
	let handler: CommandHandler;
	let messages: DaemonWorkerMessageHandler;
	let provider: { allocate: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
	let runEnded: ReturnType<typeof vi.fn>;
	let hooks: { dispatch: ReturnType<typeof vi.fn> };
	let flowCounter = 0;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cancel-exec-'));
		const registered = await registerFolderAsProject(tmpDir);
		disposeProject = registered.dispose;
		projectId = registered.project.id;
		fs.mkdirSync(path.join(tmpDir, 'daemon'), { recursive: true });
		fs.mkdirSync(path.join(tmpDir, 'executions'), { recursive: true });
		store = new ExecutionStore(path.join(tmpDir, 'executions'));
		registry = new WorkerRegistry();
		provider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(tmpDir, 'plugin-ws'), id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		runEnded = vi.fn().mockResolvedValue(undefined);
		hooks = { dispatch: vi.fn().mockResolvedValue(undefined) };
		const logWriter = { write: vi.fn(), writeExecution: vi.fn() };
		handler = new TrackedCommandHandler(
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
			{ notifyRunEnded: runEnded } as never
		);
		messages = new DaemonWorkerMessageHandler(
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
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		handler.stopBackgroundWork();
		disposeProject();
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function start(yaml: string): Promise<string> {
		const flowFile = path.join(tmpDir, `flow-${String(flowCounter++)}.yml`);
		fs.writeFileSync(flowFile, yaml);
		const result = await handler.handleRun(
			{ type: 'run', flowFile, cwd: tmpDir } as never,
			hooks as unknown as HookDispatcher
		);
		if (result.type !== 'execution_started') {
			throw new Error(`run was refused: ${JSON.stringify(result)}`);
		}
		return result.executionId;
	}

	function connect(features: string[] = []): FakeSocket {
		const ws = {
			readyState: 1,
			OPEN: 1,
			send: vi.fn(),
			terminate: vi.fn(),
			close: vi.fn(),
		} as unknown as FakeSocket;
		registry.register(ws, { pid: 1, sourceId: 'sbx-source', features }, { ephemeral: true });
		return ws;
	}

	function assignmentOf(ws: FakeSocket, stepId: string): string {
		const sent = ws.send.mock.calls
			.map(call => JSON.parse(String(call[0])) as { type: string; stepId?: string; assignmentId?: string })
			.find(message => message.type === 'assign' && message.stepId === stepId);
		if (sent?.assignmentId === undefined) {
			throw new Error(`no assignment of ${stepId} was written to the worker`);
		}
		return sent.assignmentId;
	}

	function report(ws: FakeSocket, type: string, executionId: string, stepId: string, extra: object = {}): void {
		messages.handleMessage(ws, {
			type,
			assignmentId: assignmentOf(ws, stepId),
			executionId,
			stepId,
			...extra,
		} as never);
	}

	function pause(executionId: string, reason?: string, project?: string) {
		return handler.handlePause({
			type: 'pause',
			executionId,
			...(reason === undefined ? {} : { reason }),
			...(project === undefined ? {} : { projectId: project }),
		});
	}

	function unpause(executionId: string, project?: string) {
		return handler.handleUnpause({
			type: 'unpause',
			executionId,
			...(project === undefined ? {} : { projectId: project }),
		});
	}

	function assignmentsOf(ws: FakeSocket, stepId: string): number {
		return ws.send.mock.calls
			.map(call => JSON.parse(String(call[0])) as { type: string; stepId?: string })
			.filter(message => message.type === 'assign' && message.stepId === stepId).length;
	}

	const ONE_STEP_FLOW = `id: one-flow\n${HEADER}steps:\n  - id: s1\n    name: S1\n    type: script\n    script: echo one\n`;

	it('refuses an id that is unknown, and one that is not an execution id', () => {
		expect(pause('abcdef12')).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_FOUND' });
		expect(unpause('abcdef12')).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_FOUND' });
		expect(pause('../etc/passwd')).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_FOUND' });
	});

	it('refuses a blank or too long reason and leaves the run unpaused', async () => {
		connect();
		const id = await start(CHAIN_FLOW);

		expect(pause(id, '   ')).toMatchObject({ type: 'error', code: 'INVALID_REASON' });
		expect(pause(id, 'x'.repeat(501))).toMatchObject({ type: 'error', code: 'INVALID_REASON' });
		expect(store.read(id).paused).toBeUndefined();
	});

	it('refuses an execution of another project', async () => {
		connect();
		const id = await start(CHAIN_FLOW);

		expect(pause(id, undefined, 'other-project')).toMatchObject({ type: 'error', code: 'PROJECT_MISMATCH' });
		expect(store.read(id).paused).toBeUndefined();
	});

	it('records the pause on a running run (status unchanged) and dispatches no new step while paused', async () => {
		const worker = connect();
		const id = await start(CHAIN_FLOW);
		expect(assignmentsOf(worker, 's1')).toBe(1);

		const response = pause(id, 'budget exceeded');

		expect(response).toMatchObject({ type: 'execution_paused', executionId: id, reason: 'budget exceeded' });
		expect(store.read(id)).toMatchObject({ status: 'running', paused: { reason: 'budget exceeded' } });

		// The running step finishes normally and its worker is free again; the next step is ready but must not be handed out.
		registry.markIdle(worker);
		report(worker, 'step_completed', id, 's1', { output: {} });
		expect(store.read(id).steps['s1']?.status).toBe('completed');
		expect(assignmentsOf(worker, 's2')).toBe(0);
		expect(handler.isQueueEmpty()).toBe(false);
		// A new idle worker triggers another dispatch pass: it still gets nothing.
		const second = connect();
		expect(assignmentsOf(second, 's2')).toBe(0);
		expect(store.read(id).steps['s2']?.status).toBe('pending');
	});

	it('dispatches the held step exactly once after unpause, clears the flag and keeps the paused time', async () => {
		const worker = connect();
		const id = await start(CHAIN_FLOW);
		pause(id, 'budget exceeded');
		registry.markIdle(worker);
		report(worker, 'step_completed', id, 's1', { output: {} });
		expect(assignmentsOf(worker, 's2')).toBe(0);

		const response = unpause(id);

		expect(response).toMatchObject({ type: 'execution_unpaused', executionId: id });
		const record = store.read(id);
		expect(record.paused).toBeUndefined();
		expect(record.pausedMs).toBeGreaterThanOrEqual(0);
		expect(assignmentsOf(worker, 's2')).toBe(1);
		expect(record.steps['s2']?.status).toBe('running');
		report(worker, 'step_completed', id, 's2', { output: {} });
		expect(store.read(id).status).toBe('completed');
		expect(assignmentsOf(worker, 's2')).toBe(1);
	});

	it('refuses to pause an already paused run, and to unpause a run that is not paused', async () => {
		connect();
		const id = await start(CHAIN_FLOW);

		expect(unpause(id)).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_PAUSED' });
		pause(id, 'first');
		const again = pause(id, 'second');

		expect(again).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_PAUSED' });
		expect((again as { message: string }).message).toContain('flow unpause');
		expect(store.read(id).paused?.reason).toBe('first');
		unpause(id);
		expect(unpause(id)).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_PAUSED' });
	});

	it('refuses to pause a run that ended, naming its status, and to unpause it', async () => {
		const worker = connect();
		const failed = await start(CHAIN_FLOW);
		report(worker, 'step_failed', failed, 's1', { error: 'boom' });
		const response = pause(failed);
		expect(response).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_ENDED' });
		expect((response as { message: string }).message).toContain('failed');
		expect(unpause(failed)).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_PAUSED' });

		const other = connect();
		const completed = await start(ONE_STEP_FLOW);
		report(other, 'step_completed', completed, 's1', { output: {} });
		expect(pause(completed)).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_ENDED' });
	});

	it('refuses to pause a run stopped on an unanswered intervention', async () => {
		const worker = connect();
		const id = await start(APPROVAL_FLOW);
		report(worker, 'step_completed', id, 's1', { output: {} });
		store.markStepFailed(id, 'approve', UNANSWERED);
		handler.onStepFailed(id, 'approve', UNANSWERED);

		expect(pause(id)).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_PAUSABLE' });
	});

	it('ends a paused run that completes while paused: the flag is gone and the paused time is kept', async () => {
		const worker = connect();
		const id = await start(ONE_STEP_FLOW);
		pause(id);

		report(worker, 'step_completed', id, 's1', { output: {} });

		const record = store.read(id);
		expect(record.status).toBe('completed');
		expect(record.paused).toBeUndefined();
		expect(record.pausedMs).toBeGreaterThanOrEqual(0);
	});

	it('cancels a paused run like any other: failed as cancelled, no paused flag left', async () => {
		connect();
		const id = await start(CHAIN_FLOW);
		pause(id, 'why');

		handler.handleCancel({ type: 'cancel', executionId: id });

		const record = store.read(id);
		expect(record).toMatchObject({ status: 'failed', endReason: 'cancelled' });
		expect(record.paused).toBeUndefined();
		expect(unpause(id)).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_PAUSED' });
	});
});
