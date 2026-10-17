/**
 * FlowScheduler -- which parent relaunches are "a sub-step failed" relaunches.
 *
 * The scheduler is the only place that knows why a parent is being dispatched again, so it
 * exposes that per parent (not per execution: `context.subSteps` is execution-wide and also
 * reaches unrelated steps). Consumers use it to resume the parent's session with just the
 * feedback instead of re-rendering the original prompt.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { SchedulerContext, SchedulerStep } from './FlowScheduler';

function makeContext(): SchedulerContext {
	return { inputs: {}, stepOutputs: new Map() };
}

function makeStep(id: string, extra?: Partial<SchedulerStep>): SchedulerStep {
	return { id, ...extra };
}

describe('FlowScheduler -- sub-step relaunch feedback', () => {
	it('is undefined on the first launch of the parent', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));

		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();
	});

	it('carries the failed child feedback (stderr preferred) once the parent is re-queued', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('child');

		scheduler.complete('child', {
			type: 'failed',
			error: 'Script exited with code 1',
			outputs: { stderr: 'E1', stdout: 'not-this' },
		});

		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBe('[child]\nE1');
	});

	it('is scoped to the restarted parent, never to another step', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start(
			[makeStep('parent'), makeStep('other')],
			new Map([
				['parent', []],
				['other', []],
			])
		);
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('child');
		scheduler.complete('child', { type: 'failed', error: 'boom', outputs: { stderr: 'E1' } });

		expect(scheduler.getSubStepRelaunchFeedback('other')).toBeUndefined();
		expect(scheduler.getSubStepRelaunchFeedback('child')).toBeUndefined();
	});

	it('aggregates every failed child of the run with wait-all', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', { subStepStrategy: 'wait-all' })], new Map([['parent', []]]));
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('a', { parent: 'parent' }), makeStep('b', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('a');
		scheduler.acknowledge('b');
		scheduler.complete('a', { type: 'failed', error: 'ea', outputs: { stderr: 'E-A', rawOutput: 'raw-a' } });
		scheduler.complete('b', { type: 'failed', error: 'eb', outputs: { rawOutput: 'E-B-raw' } });

		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBe('[a]\nE-A\n\n[b]\nE-B-raw');
	});

	it('is cleared once the relaunched parent completes, so it cannot leak into a later launch', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('child');
		scheduler.complete('child', { type: 'failed', error: 'boom', outputs: { stderr: 'E1' } });
		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeDefined();

		scheduler.acknowledge('parent');
		scheduler.complete('parent', { type: 'completed', outputs: {} });

		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();
	});

	it('survives a re-dispatch of the same relaunch (retry / worker lost before start)', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('child');
		scheduler.complete('child', { type: 'failed', error: 'boom', outputs: { stderr: 'E1' } });

		scheduler.acknowledge('parent');
		scheduler.unacknowledge('parent');

		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBe('[child]\nE1');
	});

	it('still fails the parent terminally with the same message after maxSubStepIterations', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', { maxSubStepIterations: 0 })], new Map([['parent', []]]));
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		scheduler.complete('parent', { type: 'completed', outputs: {} });
		scheduler.acknowledge('child');

		scheduler.complete('child', { type: 'failed', error: 'E1', outputs: { stderr: 'E1' } });

		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();
	});
});
