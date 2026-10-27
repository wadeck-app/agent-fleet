import type { RunEndEvent } from 'extension-points';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_RUN_EVENTS } from '../ipc/Protocol';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { type ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { RunEndCoordinator } from './RunEndCoordinator.js';
import { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import { WorkerRegistry } from './WorkerRegistry.js';

// What the coordinator adds for worker-type plugins: after the acknowledgements and before the follow-up, the
// instance that owns the worker's source is told the run ended. RunEndCoordinator.test.ts covers the wire side.

const ACK_TIMEOUT_MS = 30_000;

function socket(): WebSocket & { send: ReturnType<typeof vi.fn> } {
	return { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as never;
}

function stepOf(executionId: string, stepId: string): ReadyStep {
	return { stepId, stepConfig: { id: stepId } as never, executionContext: { executionId } as never };
}

type Hook = (sourceId: string, event: RunEndEvent) => Promise<void>;

function setup(notifyRunEnded = vi.fn<Hook>().mockResolvedValue(undefined)) {
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
	const coordinator = new RunEndCoordinator(
		registry,
		supervisor,
		{ writeExecution } as never,
		{ enabled: true, ackTimeoutMs: ACK_TIMEOUT_MS },
		{ notifyRunEnded }
	);
	/** A run-events worker of `sourceId` that served a step of `executionId`, its assignment already settled. */
	const serve = (sourceId: string, executionId: string, stepId = 's1') => {
		const ws = socket();
		registry.register(ws, { pid: 1, sourceId, features: [WORKER_FEATURE_RUN_EVENTS] });
		const assignmentId = supervisor.issue(ws, stepOf(executionId, stepId));
		supervisor.watchHandedOver(assignmentId);
		supervisor.settleAssignment(assignmentId);
		return ws;
	};
	const errorsLogged = () =>
		writeExecution.mock.calls.filter(call => call[2] === 'error').map(call => String(call[1]));
	/** The worker answers run_end, once the coordinator has sent it. */
	const ack = async (worker: ReturnType<typeof socket>, executionId = 'e1') => {
		await vi.waitFor(() => expect(worker.send).toHaveBeenCalled());
		coordinator.handleAck(worker, executionId);
	};
	return { coordinator, serve, errorsLogged, notifyRunEnded, ack };
}

beforeEach(() => {
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('RunEndCoordinator -- telling the worker type that owns the source', () => {
	it('calls the hook once, after the acknowledgement and before the follow-up, with the run and its reason', async () => {
		const order: string[] = [];
		const { coordinator, serve, notifyRunEnded, ack } = setup(
			vi.fn<Hook>().mockImplementation(() => {
				order.push('hook');
				return Promise.resolve();
			})
		);
		const worker = serve('sandbox', 'e1');
		const finished = coordinator.begin('e1', 'failed')!.finish(() => {
			order.push('follow-up');
			return Promise.resolve();
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(notifyRunEnded).not.toHaveBeenCalled();

		order.push('ack');
		await ack(worker);
		await finished;

		expect(notifyRunEnded).toHaveBeenCalledTimes(1);
		expect(notifyRunEnded).toHaveBeenCalledWith('sandbox', { executionId: 'e1', reason: 'failed' });
		expect(order).toEqual(['ack', 'hook', 'follow-up']);
	});

	it('tells each source once, however many of its workers served the run', async () => {
		const { coordinator, serve, notifyRunEnded, ack } = setup();
		const a1 = serve('sandbox-a', 'e1', 's1');
		const a2 = serve('sandbox-a', 'e1', 's2');
		const b = serve('sandbox-b', 'e1', 's3');
		const finished = coordinator.begin('e1', 'completed')!.finish(vi.fn().mockResolvedValue(undefined));
		await Promise.all([a1, a2, b].map(worker => ack(worker)));
		await finished;

		expect(notifyRunEnded.mock.calls.map(call => call[0]).sort()).toEqual(['sandbox-a', 'sandbox-b']);
	});

	it('still tells it when no worker answered before the timeout (the workspace is released anyway)', async () => {
		vi.useFakeTimers();
		const { coordinator, serve, notifyRunEnded } = setup();
		serve('sandbox', 'e1');
		const finished = coordinator.begin('e1', 'completed')!.finish(vi.fn().mockResolvedValue(undefined));

		await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
		await finished;

		expect(notifyRunEnded).toHaveBeenCalledTimes(1);
	});

	it("still tells it when the worker's connection closed before the acknowledgement", async () => {
		const { coordinator, serve, notifyRunEnded } = setup();
		const worker = serve('sandbox', 'e1');
		const finished = coordinator.begin('e1', 'completed')!.finish(vi.fn().mockResolvedValue(undefined));

		coordinator.workerGone(worker);
		await finished;

		expect(notifyRunEnded).toHaveBeenCalledWith('sandbox', { executionId: 'e1', reason: 'completed' });
	});

	it('does not call it when nobody had to be told', () => {
		const { coordinator, notifyRunEnded } = setup();

		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
		expect(notifyRunEnded).not.toHaveBeenCalled();
	});

	it('logs a failing hook with the source and the execution, and still runs the follow-up', async () => {
		const { coordinator, serve, errorsLogged, ack } = setup(
			vi.fn<Hook>().mockRejectedValue(new Error('docker is gone'))
		);
		const worker = serve('sandbox', 'e1');
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);

		await ack(worker);
		await finished;

		expect(afterAck).toHaveBeenCalledTimes(1);
		const [error] = errorsLogged();
		expect(error).toContain('source "sandbox"');
		expect(error).toContain('execution e1');
		expect(error).toContain('docker is gone');
		expect(error).toMatch(/by hand/);
	});

	it('gives up on a hook that never returns after the ack timeout, logs it, and releases', async () => {
		vi.useFakeTimers();
		const { coordinator, serve, errorsLogged, ack } = setup(
			vi.fn<Hook>().mockReturnValue(new Promise<void>(() => {}))
		);
		const worker = serve('sandbox', 'e1');
		const afterAck = vi.fn().mockResolvedValue(undefined);
		const finished = coordinator.begin('e1', 'completed')!.finish(afterAck);
		await ack(worker);
		await vi.advanceTimersByTimeAsync(0);
		expect(afterAck).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);
		await finished;

		expect(afterAck).toHaveBeenCalledTimes(1);
		const [error] = errorsLogged();
		expect(error).toContain('source "sandbox"');
		expect(error).toContain('execution e1');
		expect(error).toContain('30s');
	});

	it('tells it once with daemon_stopping when the daemon stops, even if the stop runs twice', async () => {
		const { coordinator, serve, notifyRunEnded } = setup();
		const worker = serve('sandbox', 'e1');

		const stopped = coordinator.announceDaemonStop();
		coordinator.announceDaemonStop();
		coordinator.handleAck(worker, 'e1');
		await stopped;

		expect(notifyRunEnded).toHaveBeenCalledTimes(1);
		expect(notifyRunEnded).toHaveBeenCalledWith('sandbox', { executionId: 'e1', reason: 'daemon_stopping' });
	});

	it('does not tell it again when the run ends after the stop already announced it', async () => {
		const { coordinator, serve, notifyRunEnded } = setup();
		const worker = serve('sandbox', 'e1');
		const stopped = coordinator.announceDaemonStop();
		coordinator.handleAck(worker, 'e1');
		await stopped;

		expect(coordinator.begin('e1', 'completed')).toBeUndefined();
		expect(notifyRunEnded).toHaveBeenCalledTimes(1);
	});

	it('works without a listener (no plugin support wired): only the wire side happens', async () => {
		const registry = new WorkerRegistry();
		const supervisor = new WorkerAssignmentSupervisor(
			registry,
			{ writeExecution: vi.fn() } as never,
			new ReadyStepQueue(),
			new ExecutionRegistry(),
			vi.fn(),
			60_000
		);
		const coordinator = new RunEndCoordinator(registry, supervisor, { writeExecution: vi.fn() } as never, {
			enabled: true,
			ackTimeoutMs: ACK_TIMEOUT_MS,
		});
		const ws = socket();
		registry.register(ws, { pid: 1, sourceId: 'sandbox', features: [WORKER_FEATURE_RUN_EVENTS] });
		const id = supervisor.issue(ws, stepOf('e1', 's1'));
		supervisor.watchHandedOver(id);
		supervisor.settleAssignment(id);
		const finished = coordinator.begin('e1', 'completed')!.finish(vi.fn().mockResolvedValue(undefined));

		await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
		coordinator.handleAck(ws, 'e1');

		await expect(finished).resolves.toBeUndefined();
	});
});
