/**
 * FlowScheduler characterization tests — lock down scheduling behavior.
 * Originally written as a spec against FlowOrchestrator, now targeting FlowScheduler directly.
 * Renamed to regression.test.ts after Phase 1 is complete (kept as .characterization for traceability).
 */
import { describe, expect, it } from 'vitest';

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

function makeStepWithWhen(id: string, when: string, deps?: string[]): SchedulerStep {
	return { id, when, depends: deps };
}

function complete(scheduler: FlowScheduler, stepId: string, outputs: Record<string, unknown> = {}): ReadyItem[] {
	const outcome: StepOutcome = { type: 'completed', outputs };
	return scheduler.complete(stepId, outcome);
}

function fail(scheduler: FlowScheduler, stepId: string, error = 'error'): ReadyItem[] {
	const outcome: StepOutcome = { type: 'failed', error };
	return scheduler.complete(stepId, outcome);
}

describe('FlowScheduler — characterization (scheduling behavior)', () => {
	describe('dependency resolution', () => {
		it('returns all steps without dependencies as immediately ready', () => {
			const ctx = makeContext();
			const scheduler = new FlowScheduler(ctx);
			const ready = scheduler.start([makeStep('a'), makeStep('b')], new Map());

			expect(ready.map(r => r.stepId).sort()).toEqual(['a', 'b']);
		});

		it('withholds a step until all its dependencies are completed', () => {
			const ctx = makeContext();
			const scheduler = new FlowScheduler(ctx);
			const ready = scheduler.start([makeStep('a'), makeStep('b', ['a'])], new Map([['b', ['a']]]));

			expect(ready.map(r => r.stepId)).toEqual(['a']);

			scheduler.acknowledge('a');
			const next = complete(scheduler, 'a');
			expect(next.map(r => r.stepId)).toEqual(['b']);
		});

		it('withholds step until ALL dependencies are complete (multi-dep)', () => {
			const ctx = makeContext();
			const scheduler = new FlowScheduler(ctx);
			scheduler.start([makeStep('a'), makeStep('b'), makeStep('c', ['a', 'b'])], new Map([['c', ['a', 'b']]]));

			scheduler.acknowledge('a');
			const afterA = complete(scheduler, 'a');
			expect(afterA).toEqual([]); // c still needs b

			scheduler.acknowledge('b');
			const afterB = complete(scheduler, 'b');
			expect(afterB.map(r => r.stepId)).toEqual(['c']);
		});
	});

	describe('when: condition', () => {
		it('runs step when when: is absent', () => {
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start([makeStep('a')], new Map());
			expect(ready.map(r => r.stepId)).toEqual(['a']);
		});

		it('runs step when when: evaluates to true', () => {
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start([makeStepWithWhen('a', 'true')], new Map());
			expect(ready.map(r => r.stepId)).toEqual(['a']);
		});

		it('skips step (not enqueued) when when: evaluates to false', () => {
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start([makeStepWithWhen('a', 'false')], new Map());
			expect(ready).toEqual([]);
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('skips step and downstream steps still run (skip propagates as completion)', () => {
			// a → b (when: false, skipped) → c (should still run)
			const steps = [makeStep('a'), makeStepWithWhen('b', 'false', ['a']), makeStep('c', ['b'])];
			const deps = new Map([
				['b', ['a']],
				['c', ['b']],
			]);
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start(steps, deps);
			expect(ready.map(r => r.stepId)).toEqual(['a']);

			scheduler.acknowledge('a');
			const after = complete(scheduler, 'a');
			// b is skipped, c should be ready
			expect(after.map(r => r.stepId)).toEqual(['c']);
		});

		it('provides dependency outputs keyed by step id as outputs context', () => {
			const ctx = makeContext();
			const steps = [makeStep('dep'), makeStepWithWhen('target', "outputs['dep'].result === 'ok'", ['dep'])];
			const deps = new Map([['target', ['dep']]]);
			const scheduler = new FlowScheduler(ctx);
			scheduler.start(steps, deps);

			scheduler.acknowledge('dep');
			const ready = complete(scheduler, 'dep', { result: 'ok' });
			expect(ready.map(r => r.stepId)).toEqual(['target']);
		});

		it('skips step when dependency output does not satisfy when:', () => {
			const ctx = makeContext();
			const steps = [makeStep('dep'), makeStepWithWhen('target', "outputs['dep'].result === 'ok'", ['dep'])];
			const deps = new Map([['target', ['dep']]]);
			const scheduler = new FlowScheduler(ctx);
			scheduler.start(steps, deps);

			scheduler.acknowledge('dep');
			const ready = complete(scheduler, 'dep', { result: 'fail' });
			expect(ready).toEqual([]);
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('provides execution inputs as inputs context', () => {
			const ctx = makeContext({ inputs: { env: 'prod' } });
			const step = makeStepWithWhen('a', "inputs.env === 'prod'");
			const scheduler = new FlowScheduler(ctx);
			const ready = scheduler.start([step], new Map());
			expect(ready.map(r => r.stepId)).toEqual(['a']);
		});

		it('throws ConditionEvaluationError when when: evaluates to non-boolean', () => {
			const scheduler = new FlowScheduler(makeContext());
			expect(() => scheduler.start([makeStepWithWhen('a', '"not-a-boolean"')], new Map())).toThrow(/boolean/);
		});
	});

	describe('step failure', () => {
		it('marks hasFailed() after a step fails without retry', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a')], new Map());
			scheduler.acknowledge('a');
			fail(scheduler, 'a');
			expect(scheduler.hasFailed()).toBe(true);
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('returns empty ready list when step fails (no retry)', () => {
			const scheduler = new FlowScheduler(makeContext());
			scheduler.start([makeStep('a'), makeStep('b', ['a'])], new Map([['b', ['a']]]));
			scheduler.acknowledge('a');
			const result = fail(scheduler, 'a');
			expect(result).toEqual([]);
		});
	});

	describe('acknowledge() — prevents duplicate dispatch', () => {
		it('does not re-include an acknowledged step in collectReady', () => {
			const scheduler = new FlowScheduler(makeContext());
			const ready = scheduler.start([makeStep('a'), makeStep('b')], new Map());
			expect(ready).toHaveLength(2);

			// Acknowledge a — it is in-flight; collectReady triggered by completing b should not include a
			scheduler.acknowledge('a');
			// If we inject a step with no deps, it is ready; a should NOT appear again
			const injected = scheduler.inject([makeStep('c')]);
			expect(injected.map(r => r.stepId)).toEqual(['c']);
		});
	});
});
