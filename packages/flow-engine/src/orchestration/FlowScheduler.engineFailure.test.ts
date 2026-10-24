/**
 * A step the engine itself failed (stall watchdog, lost worker) is not the step's own result:
 * it may already have had an effect, so neither the step's `retry`, its `onFailure.goto`, nor a
 * sub-step relaunch of the parent may silently replay it. Step-own failures keep their behaviour.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { SchedulerStep, StepOutcome } from './FlowScheduler';

const ENGINE_ERROR =
	'the worker running this step reported nothing for 1800s, so it is treated as stuck. A step that is legitimately quiet for that long needs a higher queue.stepSilenceLimitSeconds.';

const engineFailure = (error = ENGINE_ERROR): StepOutcome => ({ type: 'failed', error, origin: 'engine' });
const ownFailure = (error = 'Script exited with code 1'): StepOutcome => ({ type: 'failed', error });

function startedScheduler(steps: SchedulerStep[]): FlowScheduler {
	const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
	scheduler.start(steps, new Map(steps.map(s => [s.id, s.depends ?? []])));
	return scheduler;
}

/** parent (completed, deferred) with the given children injected and in flight. */
function parentWithChildren(parent: SchedulerStep, children: SchedulerStep[]): FlowScheduler {
	const scheduler = startedScheduler([parent]);
	scheduler.acknowledge(parent.id);
	scheduler.inject(children.map(c => ({ ...c, parent: parent.id })));
	scheduler.complete(parent.id, { type: 'completed', outputs: {} });
	for (const c of children) scheduler.acknowledge(c.id);
	return scheduler;
}

describe('FlowScheduler -- engine-origin failures', () => {
	describe('top-level step with retry', () => {
		const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 2, backoff: 'linear' } };

		it('retries a step-own failure (unchanged)', () => {
			const scheduler = startedScheduler([step]);
			scheduler.acknowledge('a');
			expect(scheduler.complete('a', ownFailure()).map(r => r.stepId)).toEqual(['a']);
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('does not retry an engine failure: the execution fails terminally', () => {
			const scheduler = startedScheduler([step]);
			scheduler.acknowledge('a');
			expect(scheduler.complete('a', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});
	});

	describe('onFailure.goto', () => {
		const steps: SchedulerStep[] = [
			{ id: 'build' },
			{ id: 'check', depends: ['build'], onFailure: { goto: 'build' } },
		];

		function atCheck(): FlowScheduler {
			const scheduler = startedScheduler(steps);
			scheduler.acknowledge('build');
			scheduler.complete('build', { type: 'completed', outputs: {} });
			scheduler.acknowledge('check');
			return scheduler;
		}

		it('loops back on a step-own failure (unchanged)', () => {
			const scheduler = atCheck();
			expect(scheduler.complete('check', ownFailure()).map(r => r.stepId)).toEqual(['build']);
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('does not loop back on an engine failure: the execution fails terminally', () => {
			const scheduler = atCheck();
			expect(scheduler.complete('check', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});
	});

	describe('sub-step of a deferred parent (restart-on-first-failure)', () => {
		it('relaunches the parent on a step-own failure (unchanged)', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [{ id: 'child' }]);
			const ready = scheduler.complete('child', ownFailure());
			expect(ready.map(r => r.stepId)).toContain('parent');
			expect(scheduler.hasFailed()).toBe(false);
			expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeDefined();
		});

		it('fails terminally on an engine failure: no parent relaunch, no feedback, no iteration consumed', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [{ id: 'child' }]);
			const ready = scheduler.complete('child', engineFailure());
			expect(ready).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
			expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();
			expect(scheduler.getSubStepErrors('parent')).toEqual([]);
		});

		it('ignores the sub-step own retry on an engine failure', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [
				{ id: 'child', retry: { maxAttempts: 2, backoff: 'linear' } },
			]);
			expect(scheduler.complete('child', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});

		it('ignores the sub-step own onFailure.goto on an engine failure', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [{ id: 'child', onFailure: { goto: 'parent' } }]);
			expect(scheduler.complete('child', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});

		it('explains the failure on the parent: engine failure, which step, the real error, not retried', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [{ id: 'child' }]);
			scheduler.complete('child', engineFailure());
			const failures = scheduler.takeParentFailures();
			expect(failures.map(f => f.stepId)).toEqual(['parent']);
			const message = failures[0]!.message;
			expect(message).toContain("Sub-step 'child'");
			expect(message).toContain('engine');
			expect(message).toContain(ENGINE_ERROR);
			expect(message).toContain('not retried');
			expect(message).toContain('may already have had an effect');
			expect(message).toContain("'parent'");
		});

		it('has no parent failure message for a step-own failure', () => {
			const scheduler = parentWithChildren({ id: 'parent' }, [{ id: 'child' }]);
			scheduler.complete('child', ownFailure());
			expect(scheduler.takeParentFailures()).toEqual([]);
		});
	});

	describe('sub-step of a deferred parent (wait-all)', () => {
		it('fails terminally at once on an engine failure, without waiting for the siblings', () => {
			const scheduler = parentWithChildren({ id: 'parent', subStepStrategy: 'wait-all' }, [
				{ id: 'a' },
				{ id: 'b' },
			]);
			expect(scheduler.complete('a', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
			expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();
		});
	});

	describe('top-level step that is itself a parent', () => {
		it('skips the parent own retry when the parent itself is the engine-failed step', () => {
			const scheduler = startedScheduler([{ id: 'parent', retry: { maxAttempts: 2, backoff: 'linear' } }]);
			scheduler.acknowledge('parent');
			expect(scheduler.complete('parent', engineFailure())).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});
	});
});
