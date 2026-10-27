import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_RUN_EVENTS } from '../ipc/Protocol';
import {
	TrackedCommandHandler,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	registeredProject,
	tmpDir,
} from './CommandHandlerTestHarness';
import type { DaemonRuntime } from './DaemonRuntime';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';
import { shutDownWorkers } from './DaemonWorkerShutdown';
import type { RunEndSettings } from './RunEndCoordinator';
import { WorkerRegistry } from './WorkerRegistry';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return {
		...actual,
		homedir: vi.fn().mockImplementation(() => actual.homedir()),
	};
});

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = mockRelease;
		},
	};
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

const PARALLEL_FLOW_YAML = `\
id: parallel-flow
version: "1.0.0"
name: Parallel Flow
description: Two independent steps
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo one
  - id: s2
    name: S2
    type: script
    script: echo two
`;

const ACK_TIMEOUT_MS = 60;

type FakeSocket = WebSocket & { send: ReturnType<typeof vi.fn>; readyState: number };

/** What the daemon wrote to a socket, parsed. */
function wrote(ws: FakeSocket): { type: string; reason?: string; assignmentId?: string; stepId?: string }[] {
	return ws.send.mock.calls.map(call => JSON.parse(String(call[0])) as { type: string });
}

function fleet(settings: Partial<RunEndSettings> = {}) {
	const registry = new WorkerRegistry();
	const provisioner = createMockWorkerPool();
	const handler = new TrackedCommandHandler(
		daemonDir,
		registry,
		provisioner as never,
		undefined,
		mockExecStore as never,
		mockLogWriter as never,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		{ enabled: true, ackTimeoutMs: ACK_TIMEOUT_MS, ...settings }
	);
	const messages = new DaemonWorkerMessageHandler(
		path.join(tmpDir, 'logs'),
		() =>
			({
				commandHandler: handler,
				workerRegistry: registry,
				relayRegistry: { remove: vi.fn() },
				executionStore: mockExecStore,
				logWriter: mockLogWriter,
				daemonSecrets: { masks: { mask: (_id: string, text: string) => text } },
			}) as unknown as DaemonRuntime,
		() => {}
	);
	/** A daemon-created worker, idle; `features` decides whether it declared run-events. */
	const connect = (features: string[] = [WORKER_FEATURE_RUN_EVENTS]): FakeSocket => {
		const ws = {
			readyState: 1,
			OPEN: 1,
			send: vi.fn(),
			terminate: vi.fn(),
			close: vi.fn(),
		} as unknown as FakeSocket;
		registry.register(ws, { pid: 1, sourceId: 'sbx-source', features }, { ephemeral: true });
		return ws;
	};
	const assignmentOf = (ws: FakeSocket, stepId: string) => {
		const assign = wrote(ws).find(m => m.type === 'assign' && m.stepId === stepId);
		if (!assign?.assignmentId) throw new Error(`no assignment of ${stepId} was written to the worker`);
		return assign.assignmentId;
	};
	const complete = (ws: FakeSocket, executionId: string, stepId: string) =>
		messages.handleMessage(ws, {
			type: 'step_completed',
			assignmentId: assignmentOf(ws, stepId),
			executionId,
			stepId,
			output: {},
		} as never);
	const fail = (ws: FakeSocket, executionId: string, stepId: string) =>
		messages.handleMessage(ws, {
			type: 'step_failed',
			assignmentId: assignmentOf(ws, stepId),
			executionId,
			stepId,
			error: 'boom',
		} as never);
	const start = (ws: FakeSocket, executionId: string, stepId: string) =>
		messages.handleMessage(ws, {
			type: 'step_started',
			assignmentId: assignmentOf(ws, stepId),
			executionId,
			stepId,
		} as never);
	const ack = (ws: FakeSocket, executionId: string) =>
		messages.handleMessage(ws, { type: 'run_end_ack', executionId } as never);
	return { registry, handler, messages, connect, complete, fail, start, ack };
}

async function startFlow(handler: TrackedCommandHandler, yaml: string): Promise<string> {
	const flowFile = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(flowFile, yaml);
	const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
	if (result.type !== 'execution_started') {
		throw new Error(`run was refused: ${JSON.stringify(result)}`);
	}
	return (result as { executionId: string }).executionId;
}

beforeEach(() => {
	mockExecStore.read.mockReturnValue({ steps: { s1: { status: 'completed' } } });
});

describe('CommandHandler -- run_end around the release of the workspace', () => {
	it('tells the worker that served the run, and releases the workspace only after its acknowledgement', async () => {
		const { handler, connect, complete, ack } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		mockRelease.mockClear();

		complete(worker, executionId, 's1');

		await vi.waitFor(() => expect(wrote(worker).filter(m => m.type === 'run_end')).toHaveLength(1));
		expect(wrote(worker).find(m => m.type === 'run_end')).toEqual({
			type: 'run_end',
			executionId,
			reason: 'completed',
		});
		expect(mockRelease).not.toHaveBeenCalled();

		ack(worker, executionId);

		await vi.waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
		expect(wrote(worker).filter(m => m.type === 'run_end')).toHaveLength(1);
	});

	it('says failed when the run ended on a terminal failure', async () => {
		const { handler, connect, fail, ack } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);

		fail(worker, executionId, 's1');

		await vi.waitFor(() => expect(wrote(worker).some(m => m.type === 'run_end')).toBe(true));
		expect(wrote(worker).find(m => m.type === 'run_end')?.reason).toBe('failed');
		ack(worker, executionId);
		await vi.waitFor(() => expect(mockRelease).toHaveBeenCalled());
	});

	it('sends nothing to a worker that did not declare run-events, and releases at once as before', async () => {
		const { handler, connect, complete } = fleet();
		const old = connect(['secrets']);
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		mockRelease.mockClear();

		complete(old, executionId, 's1');

		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(wrote(old).map(m => m.type)).toEqual(['assign']);
	});

	it('sends nothing to a run-events worker that did not serve the run', async () => {
		const { handler, connect, complete, ack } = fleet();
		const server = connect();
		const bystander = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		const [served, other] = wrote(server).some(m => m.type === 'assign')
			? [server, bystander]
			: [bystander, server];

		complete(served, executionId, 's1');
		await vi.waitFor(() => expect(wrote(served).some(m => m.type === 'run_end')).toBe(true));
		ack(served, executionId);
		await vi.waitFor(() => expect(mockRelease).toHaveBeenCalled());

		expect(wrote(other)).toEqual([]);
	});

	it('does not wait for a socket that already closed', async () => {
		const { handler, connect, complete } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		mockRelease.mockClear();
		worker.readyState = 3;

		complete(worker, executionId, 's1');

		await vi.waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
		expect(wrote(worker).some(m => m.type === 'run_end')).toBe(false);
	});

	it('stops waiting for a worker whose connection closes, and releases', async () => {
		const { handler, connect, complete, messages } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		mockRelease.mockClear();
		complete(worker, executionId, 's1');
		await vi.waitFor(() => expect(wrote(worker).some(m => m.type === 'run_end')).toBe(true));

		messages.handleClose(worker, 1006, '');

		await vi.waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
	});

	it('releases anyway when the worker never answers, with an error naming worker, source, execution and the fix', async () => {
		const { handler, connect, complete, registry } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		const workerId = registry.describe(worker)!.workerId;
		mockRelease.mockClear();
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			complete(worker, executionId, 's1');
			await vi.waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1), { timeout: 2000 });
		} finally {
			stderr.mockRestore();
		}

		const errors = mockLogWriter.writeExecution.mock.calls
			.filter(call => call[0] === executionId && call[2] === 'error')
			.map(call => String(call[1]));
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(workerId);
		expect(errors[0]).toContain('sbx-source');
		expect(errors[0]).toContain(executionId);
		expect(errors[0]).toContain('by hand');
	});

	it('behaves exactly as before when switched off: nothing sent, workspace released at once', async () => {
		const { handler, connect, complete } = fleet({ enabled: false });
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);
		mockRelease.mockClear();

		complete(worker, executionId, 's1');

		expect(mockRelease).toHaveBeenCalledTimes(1);
		expect(wrote(worker).map(m => m.type)).toEqual(['assign']);
	});

	it('ignores a run_end_ack that nobody asked for', async () => {
		const { handler, connect, ack } = fleet();
		const worker = connect();
		const executionId = await startFlow(handler, VALID_FLOW_YAML);

		expect(() => ack(worker, executionId)).not.toThrow();
		expect(mockLogWriter.writeExecution).toHaveBeenCalledWith(
			executionId,
			expect.stringContaining('run_end_ack'),
			'warning'
		);
	});
});

describe('CommandHandler -- a sibling still running when the run ends', () => {
	/** s1 fails terminally on A while s2 runs on B (both declare run-events). */
	async function failWhileSiblingRuns(options: { siblingStarted: boolean }) {
		const f = fleet();
		const workerA = f.connect();
		const workerB = f.connect();
		const executionId = await startFlow(f.handler, PARALLEL_FLOW_YAML);
		const [a, b] = wrote(workerA).some(m => m.type === 'assign' && m.stepId === 's1')
			? [workerA, workerB]
			: [workerB, workerA];
		f.start(a, executionId, 's1');
		if (options.siblingStarted) f.start(b, executionId, 's2');
		mockRelease.mockClear();
		f.fail(a, executionId, 's1');
		return { ...f, executionId, a, b };
	}

	it('holds run_end until the sibling settled, then tells both workers', async () => {
		const { executionId, a, b, complete } = await failWhileSiblingRuns({ siblingStarted: true });

		expect(wrote(a).some(m => m.type === 'run_end')).toBe(false);
		expect(wrote(b).some(m => m.type === 'run_end')).toBe(false);

		complete(b, executionId, 's2');

		await vi.waitFor(() => expect(wrote(a).some(m => m.type === 'run_end')).toBe(true));
		expect(wrote(b).some(m => m.type === 'run_end')).toBe(true);
	});

	it('after the settle wait expired, tells the workers anyway and drops the late result as before', async () => {
		const { handler, executionId, a, b, complete } = await failWhileSiblingRuns({ siblingStarted: true });

		await vi.waitFor(() => expect(wrote(b).some(m => m.type === 'run_end')).toBe(true), { timeout: 2000 });
		expect(wrote(a).some(m => m.type === 'run_end')).toBe(true);
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			expect(() => complete(b, executionId, 's2')).not.toThrow();
			const lines = stderr.mock.calls.map(call => String(call[0]));
			expect(lines.some(line => /late message after cleanup/.test(line))).toBe(true);
		} finally {
			stderr.mockRestore();
		}

		expect(handler.isExecutionActive(executionId)).toBe(false);
		// The late result changed nothing about the run: nobody is told a second time.
		expect(wrote(b).filter(m => m.type === 'run_end')).toHaveLength(1);
	});

	it('after the settle wait expired, a STARTED sibling whose worker then closes becomes worker_lost', async () => {
		const { executionId, b, messages } = await failWhileSiblingRuns({ siblingStarted: true });
		await vi.waitFor(() => expect(wrote(b).some(m => m.type === 'run_end')).toBe(true), { timeout: 2000 });
		mockExecStore.markStepFailed.mockClear();
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		try {
			messages.handleClose(b, 1006, '');
		} finally {
			stderr.mockRestore();
		}

		const lost = mockExecStore.markStepFailed.mock.calls.find(call => call[1] === 's2');
		expect(lost?.[6]).toEqual({ engineEndReason: 'worker_lost' });
		expect(lost?.[0]).toBe(executionId);
	});

	it('after the settle wait expired, a NOT-STARTED sibling whose worker then closes is dropped, not requeued', async () => {
		const { executionId, b, messages } = await failWhileSiblingRuns({ siblingStarted: false });
		await vi.waitFor(() => expect(wrote(b).some(m => m.type === 'run_end')).toBe(true), { timeout: 2000 });
		mockLogWriter.writeExecution.mockClear();
		mockExecStore.markStepFailed.mockClear();

		messages.handleClose(b, 1006, '');

		const lines = mockLogWriter.writeExecution.mock.calls
			.filter(call => call[0] === executionId)
			.map(call => String(call[1]));
		expect(lines.some(line => /already over.*dropped/.test(line))).toBe(true);
		expect(lines.some(line => /re-queued/.test(line))).toBe(false);
		expect(mockExecStore.markStepFailed.mock.calls.find(call => call[1] === 's2')).toBeUndefined();
	});
});

describe('daemon stop -- run_end goes out before the workers are closed', () => {
	async function runningFleet() {
		const f = fleet();
		const ephemeral = f.connect();
		const executionId = await startFlow(f.handler, VALID_FLOW_YAML);
		const wsServer = { close: vi.fn() };
		const stop = () =>
			shutDownWorkers({
				commandHandler: f.handler,
				workerRegistry: f.registry,
				wsServer,
			} as unknown as DaemonRuntime);
		return { ...f, ephemeral, executionId, wsServer, stop };
	}

	it('writes run_end(daemon_stopping) to a worker the daemon created BEFORE the done notice', async () => {
		const { ephemeral, executionId, stop, ack } = await runningFleet();

		const stopped = stop();

		expect(wrote(ephemeral).map(m => m.type)).toEqual(['assign', 'run_end', 'done']);
		expect(wrote(ephemeral)[1]).toEqual({ type: 'run_end', executionId, reason: 'daemon_stopping' });
		ack(ephemeral, executionId);
		await stopped;
	});

	it('writes run_end to a worker the daemon did not create before closing its socket', async () => {
		const f = fleet();
		const closeSocket = vi.fn();
		const external = {
			readyState: 1,
			OPEN: 1,
			send: vi.fn(),
			terminate: vi.fn(),
			close: closeSocket,
		} as unknown as FakeSocket;
		f.registry.register(external, {
			pid: 2,
			sourceId: 'sbx-source',
			features: [WORKER_FEATURE_RUN_EVENTS],
			attachedProjectIds: [registeredProject.id],
		});
		await startFlow(f.handler, VALID_FLOW_YAML);
		const closedAfter: number[] = [];
		closeSocket.mockImplementation(() => closedAfter.push(external.send.mock.calls.length));

		const stopped = shutDownWorkers({
			commandHandler: f.handler,
			workerRegistry: f.registry,
			wsServer: { close: vi.fn() },
		} as unknown as DaemonRuntime);

		expect(wrote(external).map(m => m.type)).toEqual(['assign', 'run_end']);
		expect(closedAfter).toEqual([2]);
		f.messages.handleClose(external, 1005, '');
		await stopped;
	});

	it('delivers once even if the shutdown hook runs twice', async () => {
		const { ephemeral, executionId, stop, ack } = await runningFleet();

		const first = stop();
		const second = stop();

		expect(wrote(ephemeral).filter(m => m.type === 'run_end')).toHaveLength(1);
		ack(ephemeral, executionId);
		await Promise.all([first, second]);
	});

	it('tells a worker without run-events nothing new: it still gets done, as before', async () => {
		const f = fleet();
		const old = f.connect(['secrets']);
		await startFlow(f.handler, VALID_FLOW_YAML);

		await shutDownWorkers({
			commandHandler: f.handler,
			workerRegistry: f.registry,
			wsServer: { close: vi.fn() },
		} as unknown as DaemonRuntime);

		expect(wrote(old).map(m => m.type)).toEqual(['assign', 'done']);
	});

	it('closes the worker listener without waiting for the acknowledgements', async () => {
		const { stop, wsServer } = await runningFleet();

		void stop();

		expect(wsServer.close).toHaveBeenCalledTimes(1);
	});
});
