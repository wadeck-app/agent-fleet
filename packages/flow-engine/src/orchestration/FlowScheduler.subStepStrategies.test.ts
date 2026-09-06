/**
 * FlowScheduler — sub-step strategy tests.
 *
 * Covers:
 * 1. wait-all: single child fails → wait (not restart), second child fails → restart with both errors
 * 2. wait-all: one child fails, one child passes → restart with only the failed error
 * 3. wait-all: both children pass → normal deferred completion (no restart)
 * 4. restart-on-first-failure: first child fails → immediate restart (default strategy)
 * 5. Custom strategy injection via extraStrategies
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerContext, SchedulerStep } from './FlowScheduler';
import type { SubStepStrategy } from './FlowScheduler.subStepStrategies';

function makeContext(overrides?: Partial<SchedulerContext>): SchedulerContext {
	return { inputs: {}, stepOutputs: new Map(), ...overrides };
}

function makeStep(id: string, deps?: string[], extra?: Partial<SchedulerStep>): SchedulerStep {
	return { id, depends: deps, ...extra };
}

function succeed(scheduler: FlowScheduler, stepId: string, outputs: Record<string, unknown> = {}): ReadyItem[] {
	return scheduler.complete(stepId, { type: 'completed', outputs });
}

function fail(scheduler: FlowScheduler, stepId: string, error = 'step-error'): ReadyItem[] {
	return scheduler.complete(stepId, { type: 'failed', error });
}

// ─── wait-all strategy ────────────────────────────────────────────────────────

describe('FlowScheduler — wait-all strategy', () => {
	it('does not restart parent when first of two children fails (waits for the second)', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'wait-all' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');

		// child-a fails — child-b still pending → wait
		const ready = fail(scheduler, 'child-a', 'error-a');
		expect(scheduler.hasFailed()).toBe(false);
		expect(ready.some(r => r.stepId === 'parent')).toBe(false);
		expect(scheduler.isTerminal()).toBe(false);
	});

	it('restarts parent with BOTH errors when second child also fails', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'wait-all' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');

		// child-a fails → wait
		fail(scheduler, 'child-a', 'error-a');

		// child-b fails → all children terminal → restart with both errors
		const ready = fail(scheduler, 'child-b', 'error-b');
		expect(scheduler.hasFailed()).toBe(false);
		expect(ready.some(r => r.stepId === 'parent')).toBe(true);

		const errors = scheduler.getSubStepErrors('parent');
		expect(errors).toContain('error-a');
		expect(errors).toContain('error-b');
	});

	it('restarts parent with only the failed child error when other child passes', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'wait-all' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');

		// child-a fails → wait (child-b still pending)
		fail(scheduler, 'child-a', 'only-this-error');

		// child-b succeeds → all terminal, child-a failed → restart with only child-a error
		const ready = succeed(scheduler, 'child-b');
		expect(scheduler.hasFailed()).toBe(false);
		expect(ready.some(r => r.stepId === 'parent')).toBe(true);

		const errors = scheduler.getSubStepErrors('parent');
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBe('only-this-error');
	});

	it('fires normal deferred completion when all children pass (no restart)', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'wait-all' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');
		succeed(scheduler, 'child-a');
		succeed(scheduler, 'child-b');

		// Both passed → normal deferred completion fires → terminal
		expect(scheduler.hasFailed()).toBe(false);
		expect(scheduler.isTerminal()).toBe(true);
		expect(scheduler.getSubStepErrors('parent')).toHaveLength(0);
	});

	it('respects maxSubStepIterations when restarting via wait-all', () => {
		const scheduler = new FlowScheduler(makeContext());
		// maxSubStepIterations: 1 → fails after 1 restart attempt
		scheduler.start(
			[makeStep('parent', [], { subStepStrategy: 'wait-all', maxSubStepIterations: 1 })],
			new Map([['parent', []]])
		);

		// First cycle: both children fail → restart (iterations = 1 <= 1)
		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a0', [], { parent: 'parent' }),
			makeStep('child-b0', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a0');
		scheduler.acknowledge('child-b0');
		succeed(scheduler, 'parent');
		fail(scheduler, 'child-a0', 'err-a0');
		const ready1 = fail(scheduler, 'child-b0', 'err-b0');
		expect(scheduler.hasFailed()).toBe(false);
		expect(ready1.some(r => r.stepId === 'parent')).toBe(true);

		// Second cycle: both children fail → iterations = 2 > 1 → parent fails terminally
		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a1', [], { parent: 'parent' }),
			makeStep('child-b1', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a1');
		scheduler.acknowledge('child-b1');
		succeed(scheduler, 'parent');
		fail(scheduler, 'child-a1', 'err-a1');
		fail(scheduler, 'child-b1', 'err-b1');

		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.isTerminal()).toBe(true);
	});
});

// ─── restart-on-first-failure strategy ───────────────────────────────────────

describe('FlowScheduler — restart-on-first-failure strategy (default)', () => {
	it('restarts parent immediately on first child failure', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');

		// child-a fails → immediate restart, no waiting for child-b
		const ready = fail(scheduler, 'child-a', 'first-error');
		expect(scheduler.hasFailed()).toBe(false);
		expect(ready.some(r => r.stepId === 'parent')).toBe(true);

		const errors = scheduler.getSubStepErrors('parent');
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBe('first-error');
	});

	it('fires normal deferred completion when all children pass', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([
			makeStep('child-a', [], { parent: 'parent' }),
			makeStep('child-b', [], { parent: 'parent' }),
		]);
		scheduler.acknowledge('child-a');
		scheduler.acknowledge('child-b');

		succeed(scheduler, 'parent');
		succeed(scheduler, 'child-a');
		succeed(scheduler, 'child-b');

		expect(scheduler.hasFailed()).toBe(false);
		expect(scheduler.isTerminal()).toBe(true);
	});
});

// ─── Custom strategy injection ────────────────────────────────────────────────

describe('FlowScheduler — custom strategy via extraStrategies', () => {
	it('uses an injected custom strategy by name', () => {
		const callLog: string[] = [];

		const alwaysFailParent: SubStepStrategy = {
			name: 'always-fail-parent',
			onChildFailure(ctx) {
				callLog.push(`onChildFailure:${ctx.failedChildId}`);
				return { type: 'fail-parent', error: `custom-fail:${ctx.error}` };
			},
			onAllChildrenTerminal(_ctx) {
				callLog.push('onAllChildrenTerminal');
				return { type: 'wait' };
			},
		};

		const scheduler = new FlowScheduler(makeContext(), { extraStrategies: [alwaysFailParent] });
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'always-fail-parent' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child-x', [], { parent: 'parent' })]);
		scheduler.acknowledge('child-x');

		succeed(scheduler, 'parent');
		fail(scheduler, 'child-x', 'child-error');

		// Custom strategy returned fail-parent → parent should be failed terminally
		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.isTerminal()).toBe(true);
		expect(callLog).toContain('onChildFailure:child-x');
	});

	it('throws when referencing an unknown strategy name', () => {
		const scheduler = new FlowScheduler(makeContext());
		scheduler.start([makeStep('parent', [], { subStepStrategy: 'nonexistent' })], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child-x', [], { parent: 'parent' })]);
		scheduler.acknowledge('child-x');

		succeed(scheduler, 'parent');

		expect(() => fail(scheduler, 'child-x', 'err')).toThrow('unknown sub-step strategy "nonexistent"');
	});

	it('custom strategy overrides a built-in when same name is provided', () => {
		const overrideLog: string[] = [];

		const override: SubStepStrategy = {
			// Same name as built-in — should shadow it
			name: 'restart-on-first-failure',
			onChildFailure(ctx) {
				overrideLog.push(ctx.failedChildId);
				return { type: 'wait' };
			},
			onAllChildrenTerminal(_ctx) {
				return { type: 'wait' };
			},
		};

		const scheduler = new FlowScheduler(makeContext(), { extraStrategies: [override] });
		scheduler.start([makeStep('parent')], new Map([['parent', []]]));

		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child-y', [], { parent: 'parent' })]);
		scheduler.acknowledge('child-y');

		succeed(scheduler, 'parent');

		// Override returns wait → no restart despite using default strategy name
		const ready = fail(scheduler, 'child-y', 'err');
		expect(ready.some(r => r.stepId === 'parent')).toBe(false);
		expect(overrideLog).toContain('child-y');
	});
});
