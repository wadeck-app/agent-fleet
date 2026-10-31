/**
 * `CommandHandler.handleCancel` (ExecutionCanceller) end to end on the daemon side: REAL FlowScheduler, ExecutionStore
 * (temp dir), WorkerRegistry (fake sockets) and CommandHandler; only the log writer and the workspace provider are stubs.
 */
import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { ExecutionStore } from '../storage/ExecutionStore';
import { CommandHandler } from './CommandHandler';
import { registerFolderAsProject } from './CommandHandlerTestHarness';
import type { DaemonRuntime } from './DaemonRuntime';
import { DaemonIdleShutdown } from './DaemonIdleShutdown';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';
import { WorkerRegistry } from './WorkerRegistry';

const HEADER = `\
version: "1.0.0"
name: Cancel Flow
description: x
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
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

describe('CommandHandler.handleCancel -- ends one execution without stopping the daemon', () => {
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
		handler = new CommandHandler(
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
			provider as never,
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
		const ws = { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as FakeSocket;
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

	function cancel(executionId: string, project?: string) {
		return handler.handleCancel({ type: 'cancel', executionId, ...(project === undefined ? {} : { projectId: project }) });
	}

	it('refuses an id that is unknown, and one that is not an execution id, without listing anything', () => {
		expect(cancel('abcdef12')).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_FOUND' });
		expect(cancel('../etc/passwd')).toMatchObject({ type: 'error', code: 'EXECUTION_NOT_FOUND' });
	});

	it('refuses an execution that already ended, naming its final status', async () => {
		const worker = connect();
		const done = await start(CHAIN_FLOW);
		report(worker, 'step_failed', done, 's1', { error: 'boom' });
		expect(store.read(done).status).toBe('failed');

		const response = cancel(done);

		expect(response).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_ENDED' });
		expect((response as { message: string }).message).toContain('failed');
		expect(store.read(done).endReason).toBeUndefined();
	});

	it('refuses a completed execution, naming completed', async () => {
		const worker = connect();
		const id = await start(`id: one-flow\n${HEADER}steps:\n  - id: s1\n    name: S1\n    type: script\n    script: echo one\n`);
		report(worker, 'step_completed', id, 's1', { output: {} });
		expect(store.read(id).status).toBe('completed');

		const response = cancel(id);

		expect(response).toMatchObject({ type: 'error', code: 'EXECUTION_ALREADY_ENDED' });
		expect((response as { message: string }).message).toContain('completed');
	});

	it('cancels a queued execution that no worker has taken: every step settled, record failed as cancelled, nothing left behind', async () => {
		const id = await start(CHAIN_FLOW);
		expect(store.read(id).status).toBe('queued');
		expect(handler.isQueueEmpty()).toBe(false);

		expect(cancel(id)).toEqual({ type: 'execution_cancelled', executionId: id, alreadyCancelled: false });

		const record = store.read(id);
		expect(record).toMatchObject({ status: 'failed', endReason: 'cancelled', lastError: 'cancelled by user' });
		expect(record.completedAt).not.toBeNull();
		expect(record.steps['s1']).toMatchObject({ status: 'completed', skippedReason: 'cancelled by user' });
		expect(record.steps['s2']).toMatchObject({ status: 'completed', skippedReason: 'cancelled by user' });
		expect(handler.isQueueEmpty()).toBe(true);
		expect(handler.hasActiveExecutions()).toBe(false);
		await vi.waitFor(() => expect(provider.release).toHaveBeenCalledTimes(1));
	});

	it('cancels a running execution: the in-flight step fails as cancelled, its worker is dropped, and a late result is ignored', async () => {
		const worker = connect();
		const id = await start(CHAIN_FLOW);
		report(worker, 'step_started', id, 's1');
		expect(store.read(id).steps['s1']!.status).toBe('running');

		expect(cancel(id)).toMatchObject({ type: 'execution_cancelled', alreadyCancelled: false });

		const record = store.read(id);
		expect(record).toMatchObject({ status: 'failed', endReason: 'cancelled', currentSteps: [] });
		expect(record.steps['s1']).toMatchObject({ status: 'failed', error: 'cancelled by user' });
		expect(record.steps['s2']).toMatchObject({ status: 'completed', skippedReason: 'cancelled by user' });
		expect(worker.terminate).toHaveBeenCalledTimes(1);
		// A cancellation is not a failure of the flow or of the step: neither failure hook fires
		const fired = hooks.dispatch.mock.calls.map(call => String(call[0]));
		expect(fired).not.toContain('onFlowError');
		expect(fired).not.toContain('onStepFailed');
		expect(fired).not.toContain('onFlowEnd');

		// The worker's step ends after the cancellation: nothing is rewritten
		report(worker, 'step_completed', id, 's1', { output: {} });
		expect(store.read(id)).toMatchObject({ status: 'failed', endReason: 'cancelled' });
		expect(store.read(id).steps['s1']!.status).toBe('failed');
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('cancels a running execution whose step has no worker and no progress (stuck scheduler)', async () => {
		const id = await start(CHAIN_FLOW);
		store.markStepRunning(id, 's1');
		expect(store.read(id).status).toBe('running');

		expect(cancel(id)).toMatchObject({ type: 'execution_cancelled', alreadyCancelled: false });

		expect(store.read(id).steps['s1']).toMatchObject({ status: 'failed', error: 'cancelled by user' });
		expect(store.read(id)).toMatchObject({ status: 'failed', endReason: 'cancelled' });
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('cancels an execution kept alive for flow resume, which then cannot be resumed', async () => {
		const worker = connect();
		const id = await start(APPROVAL_FLOW);
		report(worker, 'step_completed', id, 's1', { output: {} });
		// The intervention times out unanswered (no worker with a user interface is connected in this test)
		store.markStepFailed(id, 'approve', UNANSWERED);
		handler.onStepFailed(id, 'approve', UNANSWERED);
		expect(handler.hasResumableInterventions()).toBe(true);
		expect(store.read(id).status).toBe('failed');

		expect(cancel(id)).toMatchObject({ type: 'execution_cancelled', alreadyCancelled: false });

		expect(store.read(id)).toMatchObject({ status: 'failed', endReason: 'cancelled' });
		expect(handler.hasResumableInterventions()).toBe(false);
		expect(handler.hasActiveExecutions()).toBe(false);
		expect(handler.handleResume(id)).toMatchObject({ type: 'error', code: 'NOT_RESUMABLE' });
	});

	it('stops blocking the daemon: the idle check that gates a self-update no longer counts the cancelled execution', async () => {
		const worker = connect();
		const id = await start(CHAIN_FLOW);
		report(worker, 'step_started', id, 's1');
		const idle = new DaemonIdleShutdown(
			path.join(tmpDir, 'logs'),
			() => ({ commandHandler: handler, workerRegistry: registry }) as unknown as DaemonRuntime,
			() => {},
			() => Promise.resolve()
		);
		expect(idle.isIdle()).toBe(false);

		cancel(id);
		// The dropped worker leaves the registry when its socket closes
		registry.remove(worker);

		await vi.waitFor(() => expect(idle.isIdle()).toBe(true));
	});

	it('is idempotent: a second cancel succeeds, says so, and releases nothing twice', async () => {
		const id = await start(CHAIN_FLOW);
		cancel(id);
		await vi.waitFor(() => expect(provider.release).toHaveBeenCalledTimes(1));
		const writtenAt = store.read(id).completedAt;

		expect(cancel(id)).toEqual({ type: 'execution_cancelled', executionId: id, alreadyCancelled: true });

		expect(store.read(id).completedAt).toBe(writtenAt);
		expect(provider.release).toHaveBeenCalledTimes(1);
		expect(handler.hasActiveExecutions()).toBe(false);
	});

	it('leaves another execution untouched: its worker keeps its step and the run still completes', async () => {
		const workerA = connect();
		const workerB = connect();
		const first = await start(CHAIN_FLOW);
		const second = await start(CHAIN_FLOW);
		report(workerA, 'step_started', first, 's1');
		report(workerB, 'step_started', second, 's1');

		cancel(first);

		expect(workerA.terminate).toHaveBeenCalledTimes(1);
		expect(workerB.terminate).not.toHaveBeenCalled();
		expect(store.read(second).status).toBe('running');
		expect(handler.hasActiveExecutions()).toBe(true);
		report(workerB, 'step_completed', second, 's1', { output: {} });
		expect(store.read(second).steps['s1']!.status).toBe('completed');
	});

	it('tells the worker type of the source that served the run, as for a failed end', async () => {
		const worker = connect(['run-events']);
		const id = await start(CHAIN_FLOW);
		report(worker, 'step_started', id, 's1');

		cancel(id);

		await vi.waitFor(() => expect(runEnded).toHaveBeenCalledTimes(1));
		expect(runEnded).toHaveBeenCalledWith('sbx-source', { executionId: id, reason: 'failed' });
		await vi.waitFor(() => expect(provider.release).toHaveBeenCalledTimes(1));
	});

	it('refuses to cancel an execution of another project than the one asked', async () => {
		const id = await start(CHAIN_FLOW);

		const response = cancel(id, 'ffffffffffff');

		expect(response).toMatchObject({ type: 'error', code: 'PROJECT_MISMATCH' });
		expect(store.read(id).status).toBe('queued');
		expect(cancel(id, projectId)).toMatchObject({ type: 'execution_cancelled' });
	});
});
