import type { WebSocket } from 'ws';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { WORKER_FEATURE_RUN_EVENTS } from '../ipc/Protocol';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { type ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { RunEndCoordinator, type RunEndSettings, runEndSettingsOf } from './RunEndCoordinator.js';
import { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import { WorkerRegistry } from './WorkerRegistry.js';

const ACK_TIMEOUT_MS = 30_000;

function socket(readyState = 1): WebSocket & { send: ReturnType<typeof vi.fn> } {
	return { readyState, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as never;
}

function stepOf(executionId: string, stepId: string): ReadyStep {
	return { stepId, stepConfig: { id: stepId } as never, executionContext: { executionId } as never };
}

function setup(settings: Partial<RunEndSettings> = {}) {
	const registry = new WorkerRegistry();
	const supervisor = new WorkerAssignmentSupervisor(
		registry,
		{ writeExecution: vi.fn() } as never,
		new ReadyStepQueue(),
		new ExecutionRegistry(),
		vi.fn(),
		60_000
	);
	const writeExecution = vi.fn();
	const coordinator = new RunEndCoordinator(registry, supervisor, { writeExecution } as never, {
		enabled: true,
		ackTimeoutMs: ACK_TIMEOUT_MS,
		...settings,
	});
	/** A connected worker; `features` decides whether it declared run-events. */
	const connect = (features: string[] = [WORKER_FEATURE_RUN_EVENTS], readyState = 1) => {
		const ws = socket(readyState);
		registry.register(ws, { pid: 1, sourceId: 'sbx-source', features });
		return ws;
	};
	/** Hands a step of the run to the worker, as StepDispatcher does. Returns the assignment id. */
	const serve = (ws: WebSocket, executionId: string, stepId = 's1') => {
		const assignmentId = supervisor.issue(ws, stepOf(executionId, stepId));
		supervisor.watchHandedOver(assignmentId);
		return assignmentId;
	};
	const sentTo = (ws: { send: ReturnType<typeof vi.fn> }) =>
		ws.send.mock.calls.map(call => JSON.parse(String(call[0])) as { type: string; reason?: string });
	const errorsLogged = () =>
		writeExecution.mock.calls.filter(call => call[2] === 'error').map(call => String(call[1]));
	return { registry, supervisor, coordinator, connect, serve, sentTo, errorsLogged, writeExecution };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('RunEndCoordinator -- who is told', () => {
	it('has nothing to do when no worker served the run', () => {
		const { coordinator } = setup();
		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
	});

	it('has nothing to do, and sends nothing, for a worker that did not declare run-events', () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const old = connect(['secrets']);
		const veryOld = connect([]);
		serve(old, 'e1');
		serve(veryOld, 'e1', 's2');

		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
		expect(sentTo(old)).toEqual([]);
		expect(sentTo(veryOld)).toEqual([]);
	});

	it('has nothing to do for a run-events worker that served another run only', () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const worker = connect();
		serve(worker, 'other-run');

		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
		expect(sentTo(worker)).toEqual([]);
	});

	it('does nothing at all when switched off, even for a worker that served the run', () => {
		const { coordinator, connect, serve, sentTo } = setup({ enabled: false });
		const worker = connect();
		serve(worker, 'e1');

		expect(coordinator.begin('e1', 'failed')).toBeUndefined();
		expect(sentTo(worker)).toEqual([]);
	});
});

describe('RunEndCoordinator -- run end, acknowledgement, then the follow-up', () => {
	it('sends run_end once to a worker that served the run, and runs the follow-up only after its ack', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const worker = connect();
		const id = serve(worker, 'e1');
		const afterAck = vi.fn().mockResolvedValue(undefined);

		// The step finished before the run ended (as in cleanupExecution, where the finishing step is already settled).
		supervisor.settleAssignment(id);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);
		await vi.waitFor(() =>
			expect(sentTo(worker)).toEqual([{ type: 'run_end', executionId: 'e1', reason: 'completed' }])
		);
		expect(afterAck).not.toHaveBeenCalled();

		coordinator.handleAck(worker, 'e1');
		await finished;

		expect(afterAck).toHaveBeenCalledTimes(1);
		expect(sentTo(worker)).toHaveLength(1);
	});

	it('waits for the served workers to settle before it sends run_end', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const worker = connect();
		const sibling = serve(worker, 'e1', 'sibling');
		const finished = coordinator.begin('e1', 'failed')!.finish(vi.fn().mockResolvedValue(undefined));

		await Promise.resolve();
		expect(sentTo(worker)).toEqual([]);

		supervisor.settleAssignment(sibling);
		await vi.waitFor(() => expect(sentTo(worker)).toHaveLength(1));
		coordinator.handleAck(worker, 'e1');
		await finished;
	});

	it('sends run_end anyway once the settle wait expired, and says which workers still held steps', async () => {
		vi.useFakeTimers();
		const { coordinator, connect, serve, sentTo, writeExecution } = setup();
		const worker = connect();
		serve(worker, 'e1', 'sibling');
		const finished = coordinator.begin('e1', 'failed')!.finish(vi.fn().mockResolvedValue(undefined));

		await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);

		expect(sentTo(worker)).toEqual([{ type: 'run_end', executionId: 'e1', reason: 'failed' }]);
		expect(writeExecution).toHaveBeenCalledWith(
			'e1',
			expect.stringMatching(/still hold.*sibling results.*dropped|still holds? .*dropped/s),
			'warning'
		);
		coordinator.handleAck(worker, 'e1');
		await finished;
	});

	it('does not wait for a socket that is already closed', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const dead = connect([WORKER_FEATURE_RUN_EVENTS], 3);
		const id = serve(dead, 'e1');
		supervisor.settleAssignment(id);
		const afterAck = vi.fn().mockResolvedValue(undefined);

		await coordinator.begin('e1', 'completed')!.finish(afterAck);

		expect(sentTo(dead)).toEqual([]);
		expect(afterAck).toHaveBeenCalledTimes(1);
	});

	it('stops waiting for a worker whose connection closes before it answers', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const worker = connect();
		supervisor.settleAssignment(serve(worker, 'e1'));
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);
		await vi.waitFor(() => expect(sentTo(worker)).toHaveLength(1));

		coordinator.workerGone(worker);
		await finished;

		expect(afterAck).toHaveBeenCalledTimes(1);
	});

	it('waits for every worker, and one that answers is not enough', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const a = connect();
		const b = connect();
		supervisor.settleAssignment(serve(a, 'e1', 's1'));
		supervisor.settleAssignment(serve(b, 'e1', 's2'));
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);
		await vi.waitFor(() => expect(sentTo(b)).toHaveLength(1));

		coordinator.handleAck(a, 'e1');
		await Promise.resolve();
		expect(afterAck).not.toHaveBeenCalled();

		coordinator.handleAck(b, 'e1');
		await finished;
		expect(afterAck).toHaveBeenCalledTimes(1);
	});

	it('runs the follow-up anyway after the ack timeout, with an error naming worker, source, run and the manual fix', async () => {
		vi.useFakeTimers();
		const { coordinator, connect, serve, supervisor, registry, errorsLogged } = setup();
		const worker = connect();
		supervisor.settleAssignment(serve(worker, 'e1'));
		const workerId = registry.describe(worker)!.workerId;
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);

		await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
		await finished;

		expect(afterAck).toHaveBeenCalledTimes(1);
		const [error] = errorsLogged();
		expect(error).toContain(workerId);
		expect(error).toContain('sbx-source');
		expect(error).toContain('e1');
		expect(error).toMatch(/by hand|manually/);
		expect(error).toContain('worker.ackTimeoutSeconds');
	});

	it('ignores an ack nobody is waiting for, and says so', () => {
		const { coordinator, connect, writeExecution } = setup();
		const worker = connect();

		coordinator.handleAck(worker, 'e1');

		expect(writeExecution).toHaveBeenCalledWith('e1', expect.stringContaining('run_end_ack'), 'warning');
	});

	it('does not take an ack from a worker that was not asked', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const asked = connect();
		const stranger = connect();
		supervisor.settleAssignment(serve(asked, 'e1'));
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);
		await vi.waitFor(() => expect(sentTo(asked)).toHaveLength(1));

		coordinator.handleAck(stranger, 'e1');
		await Promise.resolve();
		expect(afterAck).not.toHaveBeenCalled();

		coordinator.handleAck(asked, 'e1');
		await finished;
	});

	it('never rejects when the follow-up fails, and names the failure', async () => {
		const { coordinator, connect, serve, supervisor, errorsLogged } = setup();
		const worker = connect();
		supervisor.settleAssignment(serve(worker, 'e1'));
		const finished = coordinator
			.begin('e1', 'completed')!
			.finish(vi.fn().mockRejectedValue(new Error('disk gone')));
		coordinator.workerGone(worker);

		await expect(finished).resolves.toBeUndefined();
		expect(errorsLogged().join('\n')).toContain('disk gone');
	});
});

describe('RunEndCoordinator -- daemon stop', () => {
	it('tells the workers of every run in progress, once, with the reason daemon_stopping', async () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const a = connect();
		const b = connect();
		serve(a, 'e1');
		serve(b, 'e2');

		const stopped = coordinator.announceDaemonStop();
		expect(sentTo(a)).toEqual([{ type: 'run_end', executionId: 'e1', reason: 'daemon_stopping' }]);
		expect(sentTo(b)).toEqual([{ type: 'run_end', executionId: 'e2', reason: 'daemon_stopping' }]);

		coordinator.handleAck(a, 'e1');
		coordinator.handleAck(b, 'e2');
		await stopped;
	});

	it('is idempotent: a second stop sends nothing more and returns the same wait', async () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const worker = connect();
		serve(worker, 'e1');

		const first = coordinator.announceDaemonStop();
		const second = coordinator.announceDaemonStop();

		expect(second).toBe(first);
		expect(sentTo(worker)).toHaveLength(1);
		coordinator.handleAck(worker, 'e1');
		await first;
	});

	it('does not tell a worker without run-events, nor one that served nothing', async () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const old = connect([]);
		const idle = connect();
		serve(old, 'e1');

		await coordinator.announceDaemonStop();

		expect(sentTo(old)).toEqual([]);
		expect(sentTo(idle)).toEqual([]);
	});

	it('does nothing when switched off', async () => {
		const { coordinator, connect, serve, sentTo } = setup({ enabled: false });
		const worker = connect();
		serve(worker, 'e1');

		await coordinator.announceDaemonStop();

		expect(sentTo(worker)).toEqual([]);
	});

	it('is bounded by ONE timeout however many runs and workers stay silent, and logs each silent worker', async () => {
		vi.useFakeTimers();
		const { coordinator, connect, serve, errorsLogged } = setup();
		for (let i = 0; i < 3; i++) serve(connect(), `e${String(i)}`);
		let stopped = false;
		void coordinator.announceDaemonStop().then(() => {
			stopped = true;
		});

		await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS - 1);
		expect(stopped).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect(stopped).toBe(true);
		expect(errorsLogged()).toHaveLength(3);
	});

	it('cuts short the settle wait of a run being finished, and the run is not told twice', async () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const worker = connect();
		serve(worker, 'e1', 'sibling');
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'failed')!.finish(afterAck);

		const stopped = coordinator.announceDaemonStop();
		expect(sentTo(worker)).toEqual([{ type: 'run_end', executionId: 'e1', reason: 'daemon_stopping' }]);

		coordinator.handleAck(worker, 'e1');
		await Promise.all([stopped, finished]);
		expect(sentTo(worker)).toHaveLength(1);
		expect(afterAck).toHaveBeenCalledTimes(1);
	});

	it('does not tell a run again when it ends after the stop announced it', async () => {
		const { coordinator, connect, serve, sentTo } = setup();
		const worker = connect();
		serve(worker, 'e1');
		const stopped = coordinator.announceDaemonStop();
		coordinator.handleAck(worker, 'e1');
		await stopped;

		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
		expect(sentTo(worker)).toHaveLength(1);
	});
});

describe('RunEndCoordinator -- work still pending after the run left the registry', () => {
	it('counts a run-end from begin until the follow-up (the release) is over', async () => {
		const { coordinator, connect, serve, supervisor, sentTo } = setup();
		const worker = connect();
		supervisor.settleAssignment(serve(worker, 'e1'));
		expect(coordinator.hasPending()).toBe(false);

		let finishRelease!: () => void;
		const release = new Promise<void>(resolve => {
			finishRelease = resolve;
		});
		const finished = coordinator.begin('e1', 'completed')!.finish(() => release);
		expect(coordinator.hasPending()).toBe(true);

		await vi.waitFor(() => expect(sentTo(worker)).toHaveLength(1));
		coordinator.handleAck(worker, 'e1');
		for (let i = 0; i < 5; i++) await Promise.resolve();
		expect(coordinator.hasPending()).toBe(true);

		finishRelease();
		await finished;
		expect(coordinator.hasPending()).toBe(false);
	});

	it('makes the daemon stop wait for the release of a run that was already ending, not only for the acks', async () => {
		const { coordinator, connect, serve, supervisor } = setup();
		const worker = connect();
		supervisor.settleAssignment(serve(worker, 'e1'));
		let finishRelease!: () => void;
		const release = new Promise<void>(resolve => {
			finishRelease = resolve;
		});
		void coordinator.begin('e1', 'completed')!.finish(() => release);
		let stopped = false;
		const stop = coordinator.announceDaemonStop().then(() => {
			stopped = true;
		});

		coordinator.handleAck(worker, 'e1');
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(stopped).toBe(false);

		finishRelease();
		await stop;
		expect(stopped).toBe(true);
	});

	it('stop announcement resolves at once when nothing is pending', async () => {
		const { coordinator } = setup();
		await expect(coordinator.announceDaemonStop()).resolves.toBeUndefined();
	});
});

describe('runEndSettingsOf -- daemon worker.* config to coordinator settings', () => {
	it('maps the defaults to enabled and 30 000 ms', () => {
		expect(runEndSettingsOf(FlowConfigLoader.DEFAULT.worker)).toEqual({ enabled: true, ackTimeoutMs: 30_000 });
	});

	it('maps the kill switch and converts seconds to milliseconds', () => {
		const worker = { ...FlowConfigLoader.DEFAULT.worker, runEventsEnabled: false, ackTimeoutSeconds: 7 };
		expect(runEndSettingsOf(worker)).toEqual({ enabled: false, ackTimeoutMs: 7_000 });
	});
});
