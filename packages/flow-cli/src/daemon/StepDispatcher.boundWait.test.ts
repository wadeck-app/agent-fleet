import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** What the dispatcher books and reports around the sources, whichever way a step ends. */
describe('StepDispatcher - the wait of a step with requirements and the unreadable sources', () => {
	const source = {
		sourceId: 'sbx-1',
		provider: 'x',
		plugin: 'sbx.impl',
		pluginsDir: '/p',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: 'x',
	} as WorkerSourceEntry;

	type Catalog = ConstructorParameters<typeof StepDispatcher>[11]['workerTypes'];

	async function build(
		boundStepWaitMs: number,
		catalog: Catalog = {
			requirementOnlyLookup: () => () => false,
			guaranteeLookup: () => sourceId => (sourceId === 'sbx-1' ? ['sandbox'] : []),
		}
	) {
		const declared = new DeclaredGuarantees(
			{ list: () => [source] },
			{ declaredGuarantees: async () => ['sandbox'] },
			() => {}
		);
		await declared.refresh();
		const logWriter = { writeExecution: vi.fn() };
		const clock = { now: 0 };
		const boundWait = new BoundStepWait(boundStepWaitMs, () => clock.now);
		const registry = {
			listIdle: () => [],
			summarize: () => [],
			listConnected: () => [],
			describe: () => undefined,
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
			{
				workerTypes: catalog,
				wait: boundWait,
				contactErrors: { sinceFor: () => () => [] },
				declaredGuarantees: declared,
			}
		);
		const enqueue = (stepId: string, executionContext: ExecutionContext = context) =>
			queue.unshift({
				stepId,
				stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
				executionContext,
			});
		return { dispatcher, boundWait, clock, enqueue, failed, executions, scheduler, logWriter, queue };
	}

	it('forgets the steps of an execution that ends while they wait for a worker that meets their requirements', async () => {
		const { dispatcher, boundWait, enqueue, executions } = await build(1_000);
		executions.bindRequirements('e1', { run: ['sandbox'], steps: {} });
		enqueue('s1');
		dispatcher.tryDispatch();
		expect(boundWait.size).toBe(1);

		dispatcher.forgetExecution('e1');

		expect(boundWait.size).toBe(0);
	});

	it('books nothing for a step that requires nothing, and leaves it queued', async () => {
		const { dispatcher, boundWait, queue, enqueue } = await build(1_000);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(boundWait.size).toBe(0);
		expect(queue.length).toBe(1);
	});

	describe('when the declared sources cannot be read', () => {
		const unreadable: Catalog = {
			requirementOnlyLookup: () => {
				throw new Error('worker-sources.json is corrupt');
			},
			guaranteeLookup: () => {
				throw new Error('worker-sources.json is corrupt');
			},
		};

		it('says so once per execution in its log, however many passes and steps it affects', async () => {
			const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			const { dispatcher, enqueue, logWriter } = await build(60_000, unreadable);
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

		it('says so again for another execution, and again for the same one after it ended and a new one began', async () => {
			const { dispatcher, enqueue, logWriter, executions, scheduler } = await build(60_000, unreadable);
			const second = { executionId: 'e2' } as ExecutionContext;
			executions.start('e2', scheduler as unknown as FlowScheduler, second, []);
			// The sources are read once per pass, so the passes are separate: the first step of a pass is the execution told.
			enqueue('s1');
			dispatcher.tryDispatch();
			dispatcher.forgetExecution('e1');
			dispatcher.tryDispatch();
			enqueue('s1', second);
			dispatcher.tryDispatch();

			const warned = logWriter.writeExecution.mock.calls
				.filter(call => /worker-sources.json/.test(String(call[1])))
				.map(call => call[0]);
			expect(warned.sort()).toEqual(['e1', 'e1', 'e2']);
		});

		it('still fails a step with requirements after the bound, with the reason', async () => {
			const { dispatcher, enqueue, clock, failed, executions } = await build(1_000, unreadable);
			executions.bindRequirements('e1', { run: ['sandbox'], steps: {} });
			enqueue('s1');
			dispatcher.tryDispatch();

			clock.now = 1_000;
			dispatcher.tryDispatch();

			expect(failed).toEqual(['s1']);
		});
	});
});
