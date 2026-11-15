import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

const sbxSource = {
	sourceId: 'sbx',
	provider: 'x',
	plugin: 'sbx.impl',
	pluginsDir: '/p',
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: 'x',
} as WorkerSourceEntry;

function workerOf(workerId: string, heldBy?: string) {
	return {
		ws: { workerId } as unknown as WebSocket,
		worker: {
			state: 'idle',
			workerId,
			pid: 1,
			labels: [],
			attachedProjects: [],
			attachedProjectIds: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
			features: [],
			sourceId: 'sbx',
			...(heldBy === undefined ? {} : { heldBy }),
		} as RegisteredWorker,
	};
}

async function build(boundStepWaitMs = 1_000) {
	const declared = new DeclaredGuarantees(
		{ list: () => [sbxSource] },
		{ declaredGuarantees: async () => ['fs=confined'] },
		() => {}
	);
	await declared.refresh();
	const clock = { now: 0 };
	const wait = new BoundStepWait(boundStepWaitMs, () => clock.now);
	const workers: ReturnType<typeof workerOf>[] = [];
	const sent: { workerId: string; executionId: string; stepId: string }[] = [];
	const registry = {
		listIdle: () => workers.filter(entry => entry.worker.state === 'idle'),
		listConnected: () => workers.map(entry => entry.worker),
		summarize: () => [],
		describe: (ws: WebSocket) => ({ workerId: (ws as unknown as { workerId: string }).workerId, features: [] }),
		markBusy: vi.fn(),
		send: vi.fn((ws: WebSocket, message: Record<string, unknown>) => {
			sent.push({
				workerId: (ws as unknown as { workerId: string }).workerId,
				executionId: String((message['executionContext'] as { executionId: string }).executionId),
				stepId: String(message['stepId']),
			});
			return true;
		}),
	};
	const queue = new ReadyStepQueue();
	const executions = new ExecutionRegistry();
	const scheduler = {
		getSubStepErrors: () => [],
		getSubSteps: () => undefined,
		getSubStepRelaunchFeedback: () => undefined,
		acknowledge: vi.fn(),
		getRetryCount: () => 0,
	} as unknown as FlowScheduler;
	const contexts = new Map<string, ExecutionContext>();
	for (const id of ['run-1', 'run-2']) {
		const context = { executionId: id } as ExecutionContext;
		contexts.set(id, context);
		executions.start(id, scheduler, context, []);
	}
	const failed: { stepId: string; reason: string }[] = [];
	const cover = vi.fn();
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover } as never,
		{ valuesForStep: () => undefined } as never,
		{ markStepRunning: vi.fn() } as never,
		{ dispatch: vi.fn() } as never,
		{ writeExecution: vi.fn() } as never,
		{ decide: () => ({ action: 'wait' }) },
		(_executionId, stepId, reason) => failed.push({ stepId, reason }),
		{
			workerTypes: {
				requirementOnlyLookup: () => () => false,
				guaranteeLookup: () => (sourceId: string | undefined) => (sourceId === 'sbx' ? ['fs=confined'] : []),
			},
			wait,
			contactErrors: { sinceFor: () => () => [] },
			declaredGuarantees: declared,
		}
	);
	const enqueue = (executionId: string, stepId: string) =>
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
			executionContext: contexts.get(executionId)!,
		});
	return { dispatcher, executions, enqueue, workers, sent, failed, cover, wait, clock, queue };
}

describe('StepDispatcher - worker held by a run', () => {
	it('does not offer a worker held by run-1 to a step of run-2 while run-1 is active; no-requires step stays queued as unplaced', async () => {
		const { dispatcher, enqueue, workers, sent, failed, cover, queue } = await build();
		workers.push(workerOf('w1', 'run-1'));
		enqueue('run-2', 's2');

		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(failed).toEqual([]);
		expect(queue.length).toBe(1);
		// A step that requires nothing is demand for a host worker (the existing unplaced path).
		expect(cover).toHaveBeenCalledWith(1, expect.anything());
	});

	it('still hands the worker a step of the run that holds it', async () => {
		const { dispatcher, enqueue, workers, sent } = await build();
		workers.push(workerOf('w1', 'run-1'));
		enqueue('run-1', 's1');

		dispatcher.tryDispatch();

		expect(sent).toEqual([{ workerId: 'w1', executionId: 'run-1', stepId: 's1' }]);
	});

	it('moves the waiting step once the hold ends', async () => {
		const { dispatcher, enqueue, workers, sent } = await build();
		const held = workerOf('w1', 'run-1');
		workers.push(held);
		enqueue('run-2', 's2');
		dispatcher.tryDispatch();
		expect(sent).toEqual([]);

		delete held.worker.heldBy;
		dispatcher.tryDispatch();

		expect(sent).toEqual([{ workerId: 'w1', executionId: 'run-2', stepId: 's2' }]);
	});

	it('makes a step with requires wait without failing and without starting the bound clock', async () => {
		const { dispatcher, executions, enqueue, workers, sent, failed, wait, clock } = await build();
		executions.bindRequirements('run-2', { run: ['fs=confined'], steps: {} });
		workers.push(workerOf('w1', 'run-1'));
		enqueue('run-2', 's2');

		dispatcher.tryDispatch();
		clock.now += 60_000;
		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(failed).toEqual([]);
		expect(wait.size).toBe(0);
	});

	// Decision D5: the serving worker is held, so the source is asked for another one (its maxWorkers is the ceiling).
	it('asks the source of the serving worker for another one when a step with requires waits for a held worker', async () => {
		const { dispatcher, executions, enqueue, workers, cover } = await build();
		executions.bindRequirements('run-2', { run: ['fs=confined'], steps: {} });
		workers.push(workerOf('w1', 'run-1'));
		enqueue('run-2', 's2');

		dispatcher.tryDispatch();

		// Nothing is demand for a host worker (0), the sbx source is named.
		expect(cover).toHaveBeenLastCalledWith(0, new Set(['sbx']));
	});

	it('asks the source for another worker when the serving worker is busy (not idle) too', async () => {
		const { dispatcher, executions, enqueue, workers, cover, sent } = await build();
		executions.bindRequirements('run-2', { run: ['fs=confined'], steps: {} });
		const busy = workerOf('w1');
		busy.worker.state = 'busy';
		// Connected, but not in the idle list.
		workers.push(busy);
		enqueue('run-2', 's2');

		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(cover).toHaveBeenLastCalledWith(0, new Set(['sbx']));
	});

	it('fails a step with requires after the bound when the hold is stale (run-1 is over), naming worker and run', async () => {
		const { dispatcher, executions, enqueue, workers, sent, failed, wait, clock } = await build();
		executions.bindRequirements('run-2', { run: ['fs=confined'], steps: {} });
		workers.push(workerOf('w1', 'run-1'));
		executions.remove('run-1');
		enqueue('run-2', 's2');

		dispatcher.tryDispatch();
		expect(wait.size).toBe(1);
		clock.now += 1_001;
		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(failed).toHaveLength(1);
		expect(failed[0]?.reason).toContain('w1');
		expect(failed[0]?.reason).toContain('run-1');
		expect(failed[0]?.reason).toContain('flow worker list');
	});

	it('characterization: two runs, one worker, no worker-busy failure; run-2 runs after run-1 releases', async () => {
		const { dispatcher, executions, enqueue, workers, sent, failed } = await build();
		executions.bindRequirements('run-1', { run: ['fs=confined'], steps: {} });
		executions.bindRequirements('run-2', { run: ['fs=confined'], steps: {} });
		const w1 = workerOf('w1');
		workers.push(w1);
		enqueue('run-1', 's1');
		dispatcher.tryDispatch();
		// The worker holds its sandbox for run-1 and is idle again (ready after the step).
		w1.worker.heldBy = 'run-1';
		enqueue('run-2', 's2');
		dispatcher.tryDispatch();
		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.executionId)).toEqual(['run-1']);
		expect(failed).toEqual([]);

		delete w1.worker.heldBy;
		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.executionId)).toEqual(['run-1', 'run-2']);
		expect(failed).toEqual([]);
	});
});
