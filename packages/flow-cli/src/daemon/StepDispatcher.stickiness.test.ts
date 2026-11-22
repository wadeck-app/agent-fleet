import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

function workerOf(workerId: string) {
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
		} as RegisteredWorker,
	};
}

function build() {
	const workers = [workerOf('w1'), workerOf('w2')];
	const sent: string[] = [];
	const registry = {
		listIdle: () => workers.filter(entry => entry.worker.state === 'idle'),
		listConnected: () => workers.map(entry => entry.worker),
		summarize: () => [],
		describe: (ws: WebSocket) => ({ workerId: (ws as unknown as { workerId: string }).workerId, features: [] }),
		markBusy: vi.fn(),
		send: vi.fn((ws: WebSocket) => {
			sent.push((ws as unknown as { workerId: string }).workerId);
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
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover: vi.fn() } as never,
		{ valuesForStep: () => undefined } as never,
		{ markStepRunning: vi.fn() } as never,
		{ dispatch: vi.fn() } as never,
		{ writeExecution: vi.fn() } as never,
		{ decide: () => ({ action: 'wait' }) },
		() => {},
		{
			workerTypes: { requirementOnlyLookup: () => () => false },
			wait: new BoundStepWait(1_000, () => 0),
			contactErrors: { sinceFor: () => () => [] },
		}
	);
	/**
	 * Queues one step of a run and dispatches it while the named workers are busy, then frees every worker (the step
	 * "ended"). Returns the worker that got it, or undefined when the step stayed queued.
	 */
	const runStep = (executionId: string, stepId: string, busyWorkerIds: string[] = []): string | undefined => {
		for (const entry of workers) {
			entry.worker.state = busyWorkerIds.includes(entry.worker.workerId) ? 'busy' : 'idle';
		}
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
			executionContext: contexts.get(executionId)!,
		});
		const before = sent.length;
		dispatcher.tryDispatch();
		for (const entry of workers) {
			entry.worker.state = 'idle';
		}
		return sent.length > before ? sent[sent.length - 1] : undefined;
	};
	return { dispatcher, runStep };
}

describe('StepDispatcher - soft stickiness', () => {
	it('sends the next step of a run to the worker that served the previous one', () => {
		const { runStep } = build();
		// w1 is busy, so the first step lands on w2; without stickiness the next one (all idle) would go to w1.
		expect(runStep('run-1', 's1', ['w1'])).toBe('w2');
		expect(runStep('run-1', 's2')).toBe('w2');
	});

	it('keeps two interleaved runs each on their own worker', () => {
		const { runStep } = build();
		expect(runStep('run-1', 's1')).toBe('w1');
		expect(runStep('run-2', 's1', ['w1'])).toBe('w2');
		expect(runStep('run-2', 's2')).toBe('w2');
		expect(runStep('run-1', 's2')).toBe('w1');
	});

	it('does not make a step wait for a busy previous worker', () => {
		const { runStep } = build();
		expect(runStep('run-1', 's1')).toBe('w1');
		expect(runStep('run-1', 's2', ['w1'])).toBe('w2');
	});

	it('forgets the previous worker when the run ends', () => {
		const { dispatcher, runStep } = build();
		expect(runStep('run-2', 's1', ['w1'])).toBe('w2');
		dispatcher.forgetExecution('run-2');
		expect(runStep('run-2', 's2')).toBe('w1');
	});
});
