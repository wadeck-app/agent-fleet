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

	function build(
		boundStepWaitMs: number,
		catalog: {
			typeLookup: () => (sourceId: string | undefined) => string | undefined;
			knownTypes: () => string[];
		} = {
			typeLookup: () => sourceId => (sourceId === 'sbx-1' ? 'sandbox' : undefined),
			knownTypes: () => ['sandbox'],
		}
	) {
		const logWriter = { writeExecution: vi.fn() };
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
			logWriter as never,
			{ decide: () => ({ action: 'wait' }) },
			(_executionId, stepId) => failed.push(stepId),
			catalog,
			boundWait
		);
		const enqueue = (stepId: string) =>
			queue.unshift({
				stepId,
				stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
				executionContext: context,
			});
		return {
			dispatcher,
			boundWait,
			clock,
			idle,
			enqueue,
			failed,
			queue,
			executions,
			scheduler,
			logWriter,
			context,
		};
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

	it('books nothing for a step of a run that is not bound, and leaves it queued', () => {
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
		expect(queue.length).toBe(1);
	});

	// A binding no source stands for (a stale run, a source removed since): the step must end, not wait for ever.
	it('books a step of a run bound to a type no source stands for, then fails it naming the known types', () => {
		const { dispatcher, boundWait, clock, executions, enqueue, failed } = build(1_000);
		executions.bindWorkerType('e1', 'ghost');
		enqueue('s1');
		dispatcher.tryDispatch();
		expect(boundWait.size).toBe(1);

		clock.now = 1_000;
		dispatcher.tryDispatch();

		expect(failed).toEqual(['s1']);
		expect(boundWait.size).toBe(0);
	});

	describe('when the declared sources cannot be read', () => {
		const unreadable = {
			typeLookup: () => {
				throw new Error('worker-sources.json is corrupt');
			},
			knownTypes: () => {
				throw new Error('worker-sources.json is corrupt');
			},
		};

		it('says so once per execution in its log, however many passes and steps it affects', () => {
			const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			const { dispatcher, enqueue, logWriter } = build(60_000, unreadable);
			enqueue('s1');
			enqueue('s2');

			for (let pass = 0; pass < 5; pass++) {
				dispatcher.tryDispatch();
			}

			const warnings = logWriter.writeExecution.mock.calls.filter(call =>
				/worker-sources.json/.test(String(call[1]))
			);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]?.[0]).toBe('e1');
			expect(String(warnings[0]?.[1])).toContain('flow worker source list');
			expect(stderr).not.toHaveBeenCalled();
			stderr.mockRestore();
		});

		it('says so again for another execution, and again for the same one after it ended and a new one began', () => {
			const { dispatcher, enqueue, logWriter, executions, scheduler, queue } = build(60_000, unreadable);
			const second = { executionId: 'e2' } as ExecutionContext;
			executions.start('e2', scheduler as unknown as FlowScheduler, second, []);
			executions.bindWorkerType('e2', 'sandbox');
			enqueue('s1');
			queue.unshift({
				stepId: 's1',
				stepConfig: { id: 's1', type: 'script' } as unknown as AssignableStep,
				executionContext: second,
			});

			dispatcher.tryDispatch();
			dispatcher.forgetExecution('e1');
			dispatcher.tryDispatch();

			const warned = logWriter.writeExecution.mock.calls
				.filter(call => /worker-sources.json/.test(String(call[1])))
				.map(call => call[0]);
			expect(warned.sort()).toEqual(['e1', 'e1', 'e2']);
		});

		it('still fails the step after the bound, with the reason', () => {
			const { dispatcher, enqueue, clock, failed } = build(1_000, unreadable);
			enqueue('s1');
			dispatcher.tryDispatch();

			clock.now = 1_000;
			dispatcher.tryDispatch();

			expect(failed).toEqual(['s1']);
		});
	});
});
