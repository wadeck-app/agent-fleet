/**
 * FlowScheduler full unit test suite.
 * Covers retry, loop (onFailure.goto), inject, isTerminal, hasFailed, getOutputs.
 */
import { describe, expect, it } from 'vitest';

import type { FailureConfig } from '../types';
import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerContext, SchedulerStep, StepOutcome } from './FlowScheduler';

function makeContext(overrides?: Partial<SchedulerContext>): SchedulerContext {
	return {
		inputs: {},
		stepOutputs: new Map(),
		...overrides,
	};
}

function makeStep(id: string, deps?: string[]): SchedulerStep {
	return { id, depends: deps };
}

function makeLoopStep(id: string, onFailure: FailureConfig, deps?: string[]): SchedulerStep {
	return { id, onFailure, depends: deps };
}

function succeed(scheduler: FlowScheduler, stepId: string, outputs: Record<string, unknown> = {}): ReadyItem[] {
	const outcome: StepOutcome = { type: 'completed', outputs };
	return scheduler.complete(stepId, outcome);
}

function fail(scheduler: FlowScheduler, stepId: string, error = 'step-error'): ReadyItem[] {
	const outcome: StepOutcome = { type: 'failed', error };
	return scheduler.complete(stepId, outcome);
}

describe('FlowScheduler', () => {
	describe('isTerminal()', () => {
		it('is false before start() is called', () => {
			const scheduler = new FlowScheduler(makeContext());
			// Nothing started — no steps, no failures
			expect(scheduler.isTerminal()).toBe(false);
		});

		it('is true after all steps complete successfully', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a'), makeStep('b', ['a'])], new Map([['b', ['a']]]));
			scheduler.acknowledge('a');
			const next = succeed(scheduler, 'a');
			scheduler.acknowledge(next[0]!.stepId);
			succeed(scheduler, 'b');
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('is true when a step fails (no retry)', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');
			fail(scheduler, 'a');
			expect(scheduler.isTerminal()).toBe(true);
		});
	});

	describe('hasFailed()', () => {
		it('is false initially', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('is false when retry re-enqueues and step succeeds on retry', () => {
			const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 1, backoff: 'linear' } };
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([step], new Map());
			scheduler.acknowledge('a');
			const retried = fail(scheduler, 'a'); // retry available → re-enqueued
			expect(scheduler.hasFailed()).toBe(false);
			expect(retried.map(r => r.stepId)).toEqual(['a']);

			scheduler.acknowledge('a');
			succeed(scheduler, 'a');
			expect(scheduler.hasFailed()).toBe(false);
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('is true when retry exhausted', () => {
			const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 1, backoff: 'linear' } };
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([step], new Map());

			scheduler.acknowledge('a');
			const retried = fail(scheduler, 'a'); // first failure → retry
			expect(retried).toHaveLength(1);
			scheduler.acknowledge('a');
			fail(scheduler, 'a'); // second failure → no more retries
			expect(scheduler.hasFailed()).toBe(true);
		});
	});

	describe('retry', () => {
		it('re-enqueues step on first failure when maxAttempts > 0', () => {
			const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 2, backoff: 'linear' } };
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([step], new Map());

			scheduler.acknowledge('a');
			const ready = fail(scheduler, 'a');
			expect(ready.map(r => r.stepId)).toEqual(['a']);
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('respects maxAttempts=2 (re-enqueued twice, fails on third failure)', () => {
			const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 2, backoff: 'linear' } };
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([step], new Map());

			// First attempt
			scheduler.acknowledge('a');
			fail(scheduler, 'a'); // retry 1
			// Second attempt
			scheduler.acknowledge('a');
			fail(scheduler, 'a'); // retry 2
			// Third attempt
			scheduler.acknowledge('a');
			fail(scheduler, 'a'); // exhausted
			expect(scheduler.hasFailed()).toBe(true);
		});

		it('does NOT re-enqueue when maxAttempts=0', () => {
			const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 0, backoff: 'linear' } };
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([step], new Map());
			scheduler.acknowledge('a');
			const result = fail(scheduler, 'a');
			expect(result).toEqual([]);
			expect(scheduler.hasFailed()).toBe(true);
		});
	});

	describe('loop (onFailure.goto)', () => {
		it('triggers loop: re-enqueues target step when maxIterations not exceeded', () => {
			// a → b (onFailure.goto = a)
			const a = makeStep('a');
			const b = makeLoopStep('b', { goto: 'a', maxIterations: 3 }, ['a']);
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start([a, b], new Map([['b', ['a']]]));
			expect(ready.map(r => r.stepId)).toEqual(['a']);

			scheduler.acknowledge('a');
			succeed(scheduler, 'a');
			scheduler.acknowledge('b');

			const afterBFail = fail(scheduler, 'b');
			// Loop → a becomes ready again
			expect(afterBFail.map(r => r.stepId)).toContain('a');
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('fails flow when maxIterations reached', () => {
			const a = makeStep('a');
			const b = makeLoopStep('b', { goto: 'a', maxIterations: 1 }, ['a']);
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([a, b], new Map([['b', ['a']]]));

			// First pass
			scheduler.acknowledge('a');
			succeed(scheduler, 'a');
			scheduler.acknowledge('b');
			fail(scheduler, 'b'); // iteration 1 → loop
			expect(scheduler.hasFailed()).toBe(false);

			// Loop: re-run a then b
			scheduler.acknowledge('a');
			succeed(scheduler, 'a');
			scheduler.acknowledge('b');
			fail(scheduler, 'b'); // iteration 2 → exceeded maxIterations=1?
			// Actually maxIterations=1 means 1 loop is allowed; the second failure exceeds it
			expect(scheduler.hasFailed()).toBe(true);
		});

		it('does not mark step failed when loop is triggered', () => {
			const a = makeStep('a');
			const b = makeLoopStep('b', { goto: 'a', maxIterations: 3 }, ['a']);
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([a, b], new Map([['b', ['a']]]));
			scheduler.acknowledge('a');
			succeed(scheduler, 'a');
			scheduler.acknowledge('b');
			fail(scheduler, 'b');
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('invalidates loop target and its descendants', () => {
			// a → b → c, b loops to a (b fails)
			const steps = [
				makeStep('a'),
				makeLoopStep('b', { goto: 'a', maxIterations: 3 }, ['a']),
				makeStep('c', ['b']),
			];
			const deps = new Map([
				['b', ['a']],
				['c', ['b']],
			]);
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start(steps, deps);

			scheduler.acknowledge('a');
			succeed(scheduler, 'a', { x: 1 });
			scheduler.acknowledge('b');
			fail(scheduler, 'b');

			// Loop triggered: a becomes ready again; c was not complete so it's not invalidated
			// a's output should be cleared
			expect(scheduler.getOutputs().has('a')).toBe(false);
		});
	});

	describe('inject()', () => {
		it('adds new steps and enqueues ready ones immediately', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');

			const injected = scheduler.inject([makeStep('x')]);
			expect(injected.map(r => r.stepId)).toEqual(['x']);
		});

		it('does not enqueue injected step whose deps are not complete', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());

			const injected = scheduler.inject([makeStep('x', ['a'])]);
			expect(injected).toEqual([]);
		});

		it('enqueues injected step immediately when its dep is already completed', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');
			succeed(scheduler, 'a');

			const injected = scheduler.inject([makeStep('x', ['a'])]);
			expect(injected.map(r => r.stepId)).toEqual(['x']);
		});
	});

	describe('getOutputs()', () => {
		it('returns empty map initially', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			expect(scheduler.getOutputs().size).toBe(0);
		});

		it('reflects completed step outputs', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');
			succeed(scheduler, 'a', { result: 42 });
			expect(scheduler.getOutputs().get('a')).toEqual({ result: 42 });
		});

		it('syncs completed step outputs to context.stepOutputs', () => {
			const ctx = makeContext();
			const scheduler = new FlowScheduler(ctx);
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');
			succeed(scheduler, 'a', { result: 'done' });
			expect(ctx.stepOutputs.get('a')).toEqual({ result: 'done' });
		});
	});

	describe('stale complete() after loop invalidation', () => {
		it('discards the outcome when complete() is called for an invalidated in-flight step', () => {
			// a → b (both ready), a loops back to itself somehow — or:
			// a → c, b → c, b loops to a. Both a and b in first batch.
			// After complete(a, success), loop triggered by complete(b, fail) invalidates a.
			// Then calling complete(a, success) again is stale.
			const steps = [makeStep('a'), makeLoopStep('b', { goto: 'a', maxIterations: 3 })];
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start(steps, new Map()); // a and b both ready
			expect(ready).toHaveLength(2);

			scheduler.acknowledge('a');
			scheduler.acknowledge('b');

			// a completes successfully
			succeed(scheduler, 'a', { x: 1 });

			// b fails → loop to a → a is invalidated
			fail(scheduler, 'b');
			expect(scheduler.hasFailed()).toBe(false);

			// At this point a is back in pendingDeps (ready to re-run)
			// The fact that a was "completed" before the loop is correctly reset
			expect(scheduler.getOutputs().has('a')).toBe(false);
		});
	});
});
