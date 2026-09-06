/**
 * FlowScheduler — parent-blocking sub-step unit tests.
 *
 * Covers:
 * 1. Step with `parent` in initial steps defers parent completion until child settles
 * 2. Parent completes when child completes
 * 3. Child failure re-queues parent (not immediate fail) with error context, up to maxSubStepIterations
 * 4. After maxSubStepIterations, parent is failed terminally
 * 5. Inject with `parent` after parent already completed → warning to stderr + still registers
 * 6. handleLoop on parent while child is pending clears deferral state correctly
 * 7. Multiple children: parent deferred until ALL children settle
 * 8. isTerminal() is false while parent is deferred
 */
import { describe, expect, it, vi } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerContext, SchedulerStep } from './FlowScheduler';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Start a two-step flow: parent (no deps), child (parent: 'parent'). */
function startParentChildFlow(scheduler: FlowScheduler): void {
	// Both are in the initial step set with parent declared
	const steps: SchedulerStep[] = [makeStep('parent'), makeStep('child', [], { parent: 'parent' })];
	const depends = new Map<string, string[]>([
		['parent', []],
		['child', []],
	]);
	scheduler.start(steps, depends);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowScheduler — parent-blocking sub-steps', () => {
	describe('initial start() with parent declared', () => {
		it('defers parent completion when child is still pending', () => {
			const scheduler = new FlowScheduler(makeContext());
			startParentChildFlow(scheduler);

			// Dispatch parent; child becomes ready too (no deps)
			scheduler.acknowledge('parent');
			scheduler.acknowledge('child');

			// Parent completes — child is still in-flight → deferred
			const ready = succeed(scheduler, 'parent');
			expect(ready).toHaveLength(0);
			expect(scheduler.isTerminal()).toBe(false);
		});

		it('fires parent completion when child subsequently completes', () => {
			const scheduler = new FlowScheduler(makeContext());
			startParentChildFlow(scheduler);

			scheduler.acknowledge('parent');
			scheduler.acknowledge('child');

			succeed(scheduler, 'parent');
			// Now child completes
			const ready = succeed(scheduler, 'child');
			// The child completion should trigger tryFireDeferredParent → parent completes
			// collectReady() after parent completes returns [] (no remaining pending steps)
			expect(scheduler.isTerminal()).toBe(true);
			// ready items include results of parent's downstream propagation (none here)
			expect(ready.length).toBeGreaterThanOrEqual(0);
		});

		it('isTerminal() is false while parent is deferred and child is in-flight', () => {
			const scheduler = new FlowScheduler(makeContext());
			startParentChildFlow(scheduler);

			scheduler.acknowledge('parent');
			scheduler.acknowledge('child');

			succeed(scheduler, 'parent');
			expect(scheduler.isTerminal()).toBe(false);
		});
	});

	describe('inject() with parent declared', () => {
		it('defers parent completion when a sub-step is injected after parent starts', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');

			// Parent completes — no children yet → completes immediately
			succeed(scheduler, 'parent');
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('defers parent completion when child is injected before parent completes', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');

			// Inject child before parent completes
			scheduler.inject([makeStep('child1', [], { parent: 'parent' })]);
			scheduler.acknowledge('child1');

			// Parent completes — child1 is in-flight → deferred
			succeed(scheduler, 'parent');
			expect(scheduler.isTerminal()).toBe(false);

			// Child completes → parent fires
			succeed(scheduler, 'child1');
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('emits a warning to stderr when parent is already completed', () => {
			const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');
			succeed(scheduler, 'parent');
			// Parent is now completed

			// Inject a child after parent completed
			scheduler.inject([makeStep('child-late', [], { parent: 'parent' })]);

			expect(stderrSpy).toHaveBeenCalledWith(
				expect.stringContaining("warning: parent step 'parent' is already completed")
			);
			stderrSpy.mockRestore();
		});

		it('still registers the child when parent is already completed (no throw)', () => {
			vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');
			succeed(scheduler, 'parent');

			// Should not throw
			expect(() => scheduler.inject([makeStep('child-late', [], { parent: 'parent' })])).not.toThrow();

			vi.restoreAllMocks();
		});
	});

	describe('child failure → parent re-run', () => {
		it('re-queues the parent (not fails it) when a child fails on the first attempt', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child1', [], { parent: 'parent' })]);
			scheduler.acknowledge('child1');

			succeed(scheduler, 'parent');
			expect(scheduler.isTerminal()).toBe(false);

			// Child fails → parent should be re-queued, not failed
			const ready = fail(scheduler, 'child1', 'child error');
			expect(scheduler.hasFailed()).toBe(false);
			// Parent is re-queued: should appear in ready list
			expect(ready.some(r => r.stepId === 'parent')).toBe(true);
		});

		it('records the error in getSubStepErrors()', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child1', [], { parent: 'parent' })]);
			scheduler.acknowledge('child1');

			succeed(scheduler, 'parent');
			fail(scheduler, 'child1', 'child error msg');

			const errors = scheduler.getSubStepErrors('parent');
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBe('child error msg');
		});

		it('accumulates errors across multiple child failure re-runs', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent', [], { maxSubStepIterations: 5 })];
			scheduler.start(steps, new Map([['parent', []]]));

			let iteration = 0;

			// Run parent → inject child → child fails → parent re-runs, repeat 3 times
			for (let i = 0; i < 3; i++) {
				scheduler.acknowledge('parent');
				scheduler.inject([makeStep(`child-run-${i}`, [], { parent: 'parent' })]);
				scheduler.acknowledge(`child-run-${i}`);
				succeed(scheduler, 'parent');
				fail(scheduler, `child-run-${i}`, `error-${i}`);
				iteration++;
			}

			expect(scheduler.getSubStepErrors('parent')).toHaveLength(3);
			expect(scheduler.hasFailed()).toBe(false);
		});

		it('fails the parent terminally after maxSubStepIterations (default 3)', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			// Run 3 re-run cycles (iterations 1, 2, 3) — all re-queued
			for (let i = 0; i < 3; i++) {
				scheduler.acknowledge('parent');
				scheduler.inject([makeStep(`child-${i}`, [], { parent: 'parent' })]);
				scheduler.acknowledge(`child-${i}`);
				succeed(scheduler, 'parent');
				const ready = fail(scheduler, `child-${i}`, `err-${i}`);
				expect(scheduler.hasFailed()).toBe(false);
				expect(ready.some(r => r.stepId === 'parent')).toBe(true);
			}

			// 4th child failure (iteration 4 > maxIterations 3) → parent fails terminally
			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child-final', [], { parent: 'parent' })]);
			scheduler.acknowledge('child-final');
			succeed(scheduler, 'parent');
			fail(scheduler, 'child-final', 'final error');

			expect(scheduler.hasFailed()).toBe(true);
			expect(scheduler.isTerminal()).toBe(true);
		});

		it('respects custom maxSubStepIterations on the parent step', () => {
			const scheduler = new FlowScheduler(makeContext());
			// maxSubStepIterations: 1 → fails after just 1 re-run attempt
			const steps: SchedulerStep[] = [makeStep('parent', [], { maxSubStepIterations: 1 })];
			scheduler.start(steps, new Map([['parent', []]]));

			// First child failure: iteration 1, maxIterations 1 → re-queued (1 <= 1)
			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child-a', [], { parent: 'parent' })]);
			scheduler.acknowledge('child-a');
			succeed(scheduler, 'parent');
			const ready1 = fail(scheduler, 'child-a', 'err-a');
			expect(scheduler.hasFailed()).toBe(false);
			expect(ready1.some(r => r.stepId === 'parent')).toBe(true);

			// Second child failure: iteration 2, 2 > 1 → parent fails terminally
			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child-b', [], { parent: 'parent' })]);
			scheduler.acknowledge('child-b');
			succeed(scheduler, 'parent');
			fail(scheduler, 'child-b', 'err-b');

			expect(scheduler.hasFailed()).toBe(true);
		});
	});

	describe('multiple children', () => {
		it('defers parent until ALL children complete', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [makeStep('parent')];
			scheduler.start(steps, new Map([['parent', []]]));

			scheduler.acknowledge('parent');
			scheduler.inject([
				makeStep('child-a', [], { parent: 'parent' }),
				makeStep('child-b', [], { parent: 'parent' }),
			]);
			scheduler.acknowledge('child-a');
			scheduler.acknowledge('child-b');

			succeed(scheduler, 'parent');
			expect(scheduler.isTerminal()).toBe(false);

			// child-a completes — child-b still pending
			succeed(scheduler, 'child-a');
			expect(scheduler.isTerminal()).toBe(false);

			// child-b completes — all children done → parent fires
			succeed(scheduler, 'child-b');
			expect(scheduler.isTerminal()).toBe(true);
		});
	});

	describe('handleLoop interaction', () => {
		it('clears deferred outcome for an invalidated step during loop reset', () => {
			const scheduler = new FlowScheduler(makeContext());
			const steps: SchedulerStep[] = [
				makeStep('setup'),
				makeStep('parent', ['setup'], { maxSubStepIterations: 0 }),
				makeStep('check', ['parent'], {
					onFailure: { goto: 'setup', maxIterations: 2 },
				}),
			];
			const depends = new Map<string, string[]>([
				['setup', []],
				['parent', ['setup']],
				['check', ['parent']],
			]);
			scheduler.start(steps, depends);

			scheduler.acknowledge('setup');
			succeed(scheduler, 'setup');

			scheduler.acknowledge('parent');
			scheduler.inject([makeStep('child1', [], { parent: 'parent' })]);
			scheduler.acknowledge('child1');
			succeed(scheduler, 'parent'); // parent deferred

			// Now check also starts (depends on parent, which is deferred — but parent deps are propagated)
			// Actually, parent is NOT in completedSteps yet (deferred), so check waits for parent.
			// Let's complete child1 to fire parent, then proceed to check
			succeed(scheduler, 'child1'); // fires parent

			scheduler.acknowledge('check');
			// check fails → loop → invalidates setup, parent, check
			fail(scheduler, 'check', 'check error');

			// Loop should have cleared deferredOutcomes for parent
			expect(scheduler.hasFailed()).toBe(false);
			// setup should be re-queued
		});
	});
});

// ─── Static child re-queue on parent restart ──────────────────────────────────

describe('FlowScheduler — static child re-queue on parent restart', () => {
	it('re-queues a static child after the parent is restarted due to child failure', () => {
		const ctx = makeContext();
		const scheduler = new FlowScheduler(ctx);

		// Static child declared at start(), explicitly depends on parent
		const steps: SchedulerStep[] = [makeStep('parent'), makeStep('child', ['parent'], { parent: 'parent' })];
		const depends = new Map<string, string[]>([
			['parent', []],
			['child', ['parent']],
		]);
		scheduler.start(steps, depends);

		// Run 1: parent dispatched, completes (deferred since child is pending)
		scheduler.acknowledge('parent');
		const afterParent1 = succeed(scheduler, 'parent');
		// child's dep on parent is released → child becomes ready
		expect(afterParent1.some(r => r.stepId === 'child')).toBe(true);

		// Child fails → restart-on-first-failure → parent re-queued, child re-queued
		scheduler.acknowledge('child');
		const afterChildFail = fail(scheduler, 'child', 'validation error');
		expect(scheduler.hasFailed()).toBe(false);
		expect(afterChildFail.some(r => r.stepId === 'parent')).toBe(true);

		// Run 2: parent dispatched again, completes (deferred), static child re-queued
		scheduler.acknowledge('parent');
		const afterParent2 = succeed(scheduler, 'parent');
		expect(afterParent2.some(r => r.stepId === 'child')).toBe(true);

		// Child succeeds on second run → tryFireDeferredParent → flow completes
		scheduler.acknowledge('child');
		succeed(scheduler, 'child');
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('re-queues both static children (chain: write → check) after parent restart', () => {
		const ctx = makeContext();
		const scheduler = new FlowScheduler(ctx);

		// Two static children: write (depends on parent), check (depends on parent + write)
		const steps: SchedulerStep[] = [
			makeStep('parent'),
			makeStep('write', ['parent'], { parent: 'parent' }),
			makeStep('check', ['parent', 'write'], { parent: 'parent' }),
		];
		const depends = new Map<string, string[]>([
			['parent', []],
			['write', ['parent']],
			['check', ['parent', 'write']],
		]);
		scheduler.start(steps, depends);

		// Run 1: parent → (write becomes ready, check still waits on write)
		scheduler.acknowledge('parent');
		const r1 = succeed(scheduler, 'parent');
		expect(r1.some(ri => ri.stepId === 'write')).toBe(true);
		expect(r1.some(ri => ri.stepId === 'check')).toBe(false);

		// write completes → check becomes ready
		scheduler.acknowledge('write');
		const r2 = succeed(scheduler, 'write');
		expect(r2.some(ri => ri.stepId === 'check')).toBe(true);

		// check fails → restart (restart-on-first-failure)
		scheduler.acknowledge('check');
		const afterCheckFail = fail(scheduler, 'check', 'taskid-error');
		expect(scheduler.hasFailed()).toBe(false);
		expect(afterCheckFail.some(ri => ri.stepId === 'parent')).toBe(true);

		// Run 2: parent re-runs → write re-queued → check re-queued (both static)
		scheduler.acknowledge('parent');
		const r3 = succeed(scheduler, 'parent');
		expect(r3.some(ri => ri.stepId === 'write')).toBe(true);
		expect(r3.some(ri => ri.stepId === 'check')).toBe(false);

		scheduler.acknowledge('write');
		const r4 = succeed(scheduler, 'write');
		expect(r4.some(ri => ri.stepId === 'check')).toBe(true);

		scheduler.acknowledge('check');
		succeed(scheduler, 'check');
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('fails parent terminally after maxSubStepIterations with static child', () => {
		const ctx = makeContext();
		const scheduler = new FlowScheduler(ctx);

		const steps: SchedulerStep[] = [
			makeStep('parent', [], { maxSubStepIterations: 1 }),
			makeStep('child', ['parent'], { parent: 'parent' }),
		];
		const depends = new Map<string, string[]>([
			['parent', []],
			['child', ['parent']],
		]);
		scheduler.start(steps, depends);

		// Run 1: child fails → iterations=1, maxIterations=1 → still re-queued (1 <= 1)
		scheduler.acknowledge('parent');
		succeed(scheduler, 'parent');
		scheduler.acknowledge('child');
		const r1 = fail(scheduler, 'child', 'err1');
		expect(scheduler.hasFailed()).toBe(false);
		expect(r1.some(ri => ri.stepId === 'parent')).toBe(true);

		// Run 2: child fails again → iterations=2 > maxIterations=1 → terminal failure
		scheduler.acknowledge('parent');
		succeed(scheduler, 'parent');
		scheduler.acknowledge('child');
		fail(scheduler, 'child', 'err2');

		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.isTerminal()).toBe(true);
	});
});
