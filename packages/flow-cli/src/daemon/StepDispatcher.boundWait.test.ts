import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';

/** The booking a bound step leaves in {@link BoundStepWait} must end with the step, whichever way it ends. */
describe('StepDispatcher - the wait of a step of a bound run is forgotten', () => {
	const sandboxWs = { name: 'sandbox' } as unknown as WebSocket;
	const sandbox = {
		ws: sandboxWs,
		worker: {
			state: 'idle',
			workerId: 'sandbox',
			pid: 1,
			labels: [],
			attachedProjects: [],
			attachedProjectIds: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
			features: [],
			sourceId: 'sbx-1',
		},
	};

	function build(boundStepWaitMs: number) {
		const clock = { now: 0 };
		const boundWait = new BoundStepWait(boundStepWaitMs, () => clock.now);
		const idle: (typeof sandbox)[] = [];
		const registry = {
			listIdle: () => idle,
			summarize: () => [],
			describe: () => ({ workerId: 'sandbox', sourceId: 'sbx-1', features: [] as string[] }),
			markBusy: vi.fn(),
			send: vi.fn(() => true),
		};
		const queue = new ReadyStepQueue();
		const executions = new ExecutionRegistry();
		const scheduler = {
			getSubStepErrors: () => [],
			getSubSteps: () => undefined,
			getSubStepRelaunchFeedback: () => undefined,
			acknowledge: vi.fn(),
			getRetryCount: () => 0,
		};
		const context = { executionId: 'e1' } as ExecutionContext;
		executions.start('e1', scheduler as unknown as FlowScheduler, context, []);
		executions.bindWorkerType('e1', 'sandbox');
		const failed: string[] = [];
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
			(_executionId, stepId) => failed.push(stepId),
			{
				typeLookup: () => sourceId => (sourceId === 'sbx-1' ? 'sandbox' : undefined),
				knownTypes: () => ['sandbox'],
			},
			boundWait
		);
		const enqueue = (stepId: string) =>
			queue.unshift({
				stepId,
				stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
				executionContext: context,
			});
		return { dispatcher, boundWait, clock, idle, enqueue, failed, queue, executions, scheduler };
	}

	it('books the step while it waits for a worker of its type', () => {
		const { dispatcher, boundWait, enqueue } = build(1_000);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(boundWait.size).toBe(1);
	});

	it('forgets the step when it is handed to a worker', () => {
		const { dispatcher, boundWait, idle, enqueue, failed } = build(1_000);
		enqueue('s1');
		dispatcher.tryDispatch();

		idle.push(sandbox);
		dispatcher.tryDispatch();

		expect(boundWait.size).toBe(0);
		expect(failed).toEqual([]);
	});

	it('forgets the step when it fails for want of a worker', () => {
		const { dispatcher, boundWait, clock, enqueue, failed } = build(1_000);
		enqueue('s1');
		dispatcher.tryDispatch();

		clock.now = 1_000;
		dispatcher.tryDispatch();

		expect(failed).toEqual(['s1']);
		expect(boundWait.size).toBe(0);
	});

	it('forgets the steps of an execution that ends while they wait', () => {
		const { dispatcher, boundWait, enqueue } = build(1_000);
		enqueue('s1');
		dispatcher.tryDispatch();

		dispatcher.forgetExecution('e1');

		expect(boundWait.size).toBe(0);
	});

	it('books nothing for a step of a run that is not bound', () => {
		const { dispatcher, boundWait, queue, executions, scheduler } = build(1_000);
		const otherContext = { executionId: 'e2' } as ExecutionContext;
		executions.start('e2', scheduler as unknown as FlowScheduler, otherContext, []);
		queue.unshift({
			stepId: 's1',
			stepConfig: { id: 's1', type: 'script' } as unknown as AssignableStep,
			executionContext: otherContext,
		});

		dispatcher.tryDispatch();

		expect(boundWait.size).toBe(0);
	});
});
