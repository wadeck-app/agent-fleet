import type { WebSocket } from 'ws';

import { ExecutionRegistry } from './ExecutionRegistry.js';
import { type ReadyStep, ReadyStepQueue } from './ReadyStepQueue.js';
import { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';

function fakeSocket(): WebSocket {
	return {} as unknown as WebSocket;
}

function stepOf(executionId: string, stepId: string): ReadyStep {
	return { stepId, stepConfig: { id: stepId } as never, executionContext: { executionId } as never };
}

function newSupervisor() {
	const failStep = vi.fn();
	const supervisor = new WorkerAssignmentSupervisor(
		{ disconnect: vi.fn() } as never,
		{ writeExecution: vi.fn() } as never,
		new ReadyStepQueue(),
		new ExecutionRegistry(),
		failStep,
		60_000
	);
	return { supervisor, failStep };
}

/** Issues and hands over a step the way StepDispatcher does. */
function handOver(supervisor: WorkerAssignmentSupervisor, worker: WebSocket, executionId: string, stepId: string) {
	const assignmentId = supervisor.issue(worker, stepOf(executionId, stepId));
	supervisor.watchHandedOver(assignmentId);
	return assignmentId;
}

describe('WorkerAssignmentSupervisor -- workers that served a run', () => {
	it('records a worker once a step of the run was handed over to it', () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		handOver(supervisor, a, 'e1', 's1');

		expect(supervisor.servedWorkers('e1')).toEqual([a]);
		expect(supervisor.servedWorkers('other')).toEqual([]);
	});

	it('does not record an assignment that was issued but never handed over', () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const assignmentId = supervisor.issue(a, stepOf('e1', 's1'));
		supervisor.discardUnsent(assignmentId);

		expect(supervisor.servedWorkers('e1')).toEqual([]);
	});

	it('keeps a worker recorded after its assignment settled, and lists it once for several steps', () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const first = handOver(supervisor, a, 'e1', 's1');
		supervisor.settleAssignment(first);
		handOver(supervisor, a, 'e1', 's2');

		expect(supervisor.servedWorkers('e1')).toEqual([a]);
	});

	it('forgets a worker whose connection closed', () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const b = fakeSocket();
		handOver(supervisor, a, 'e1', 's1');
		handOver(supervisor, b, 'e1', 's2');

		supervisor.handleWorkerDisconnect(a);

		expect(supervisor.servedWorkers('e1')).toEqual([b]);
	});

	it('forgets the run when it is over', () => {
		const { supervisor } = newSupervisor();
		handOver(supervisor, fakeSocket(), 'e1', 's1');

		supervisor.forgetExecution('e1');

		expect(supervisor.servedWorkers('e1')).toEqual([]);
	});
});

describe('WorkerAssignmentSupervisor -- waiting for the served workers to settle', () => {
	it('resolves at once when none of the workers holds an assignment of the run', async () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const id = handOver(supervisor, a, 'e1', 's1');
		supervisor.settleAssignment(id);

		await expect(supervisor.awaitSettled('e1', [a]).done).resolves.toBeUndefined();
	});

	it('waits for every outstanding assignment of the run on those workers, then resolves', async () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const b = fakeSocket();
		const onA = handOver(supervisor, a, 'e1', 's1');
		const onB = handOver(supervisor, b, 'e1', 's2');
		let resolved = false;
		void supervisor.awaitSettled('e1', [a, b]).done.then(() => {
			resolved = true;
		});

		supervisor.settleAssignment(onA);
		await Promise.resolve();
		expect(resolved).toBe(false);

		supervisor.settleAssignment(onB);
		await Promise.resolve();
		expect(resolved).toBe(true);
	});

	it('ignores assignments of other runs and of workers outside the given set', async () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const stranger = fakeSocket();
		handOver(supervisor, a, 'other-run', 's1');
		handOver(supervisor, stranger, 'e1', 's2');

		await expect(supervisor.awaitSettled('e1', [a]).done).resolves.toBeUndefined();
	});

	it('resolves when the worker disconnects (its assignments are revoked)', async () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		handOver(supervisor, a, 'e1', 's1');
		let resolved = false;
		void supervisor.awaitSettled('e1', [a]).done.then(() => {
			resolved = true;
		});

		supervisor.handleWorkerDisconnect(a);
		await Promise.resolve();

		expect(resolved).toBe(true);
	});

	it('stops watching once cancelled, so a timed-out wait leaves nothing behind', async () => {
		const { supervisor } = newSupervisor();
		const a = fakeSocket();
		const id = handOver(supervisor, a, 'e1', 's1');
		const wait = supervisor.awaitSettled('e1', [a]);
		let resolved = false;
		void wait.done.then(() => {
			resolved = true;
		});

		wait.cancel();
		supervisor.settleAssignment(id);
		await Promise.resolve();

		expect(resolved).toBe(false);
	});
});
