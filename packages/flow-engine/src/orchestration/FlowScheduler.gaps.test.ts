/**
 * FlowScheduler -- characterization of behaviours that no other scheduler test pinned down before the
 * class was split into focused collaborators (stale results, `when` expression forms, loop reset and
 * skip, strategy misuse, read accessors). Written against the unsplit class and kept green through the split.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerContext, SchedulerStep } from './FlowScheduler';
import type { SubStepStrategy } from './FlowScheduler.subStepStrategies';

function makeContext(overrides?: Partial<SchedulerContext>): SchedulerContext {
	return { inputs: {}, stepOutputs: new Map(), ...overrides };
}

function makeStep(id: string, extra?: Partial<SchedulerStep>): SchedulerStep {
	return { id, ...extra };
}

function depsOf(steps: SchedulerStep[]): Map<string, string[]> {
	return new Map(steps.map(step => [step.id, step.depends ?? []]));
}

function startAll(scheduler: FlowScheduler, steps: SchedulerStep[]): ReadyItem[] {
	return scheduler.start(steps, depsOf(steps));
}

function succeed(scheduler: FlowScheduler, stepId: string, outputs: Record<string, unknown> = {}): ReadyItem[] {
	return scheduler.complete(stepId, { type: 'completed', outputs });
}

function fail(scheduler: FlowScheduler, stepId: string, error = 'step-error'): ReadyItem[] {
	return scheduler.complete(stepId, { type: 'failed', error });
}

function ids(items: ReadyItem[]): string[] {
	return items.map(item => item.stepId).sort();
}

describe('FlowScheduler -- stale results and unknown steps', () => {
	it('discards the result of a step invalidated by a loop while it was in flight', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [
			makeStep('a'),
			makeStep('b', { depends: ['a'], onFailure: { goto: 'a' } }),
			makeStep('c', { depends: ['a'] }),
		]);
		scheduler.acknowledge('a');
		succeed(scheduler, 'a');
		scheduler.acknowledge('b');
		scheduler.acknowledge('c');

		const afterLoop = fail(scheduler, 'b');
		expect(ids(afterLoop)).toEqual(['a']);

		// c finished after the loop invalidated it: its result must not count
		expect(succeed(scheduler, 'c', { late: true })).toEqual([]);
		expect(scheduler.isInFlight('c')).toBe(false);
		expect(scheduler.getOutputs().has('c')).toBe(false);
	});

	it('throws on a failed outcome for an unknown step', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [makeStep('a')]);
		expect(() => fail(scheduler, 'ghost')).toThrow('unknown stepId "ghost" in complete()');
	});
});

describe('FlowScheduler -- when conditions', () => {
	it('accepts the ${{ }} wrapper and hyphenated step ids in dot notation', () => {
		const scheduler = new FlowScheduler(makeContext({ inputs: { mode: 'fast' } }));
		const steps = [
			makeStep('get-status'),
			makeStep('run', {
				depends: ['get-status'],
				when: "${{ steps.get-status.outputs.state === 'ok' && inputs.mode === 'fast' }}",
			}),
			makeStep('other', { depends: ['get-status'], when: 'outputs.get-status.state === "bad"' }),
		];
		startAll(scheduler, steps);
		scheduler.acknowledge('get-status');
		const ready = succeed(scheduler, 'get-status', { state: 'ok' });
		expect(ids(ready)).toEqual(['run']);
		// 'other' is skipped by its condition and counts as completed
		scheduler.acknowledge('run');
		succeed(scheduler, 'run');
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('fails with a ConditionEvaluationError naming the step when the condition is not boolean', () => {
		const scheduler = new FlowScheduler(makeContext());
		const steps = [makeStep('a', { when: '1 + 1' })];
		expect(() => startAll(scheduler, steps)).toThrow(/Condition must evaluate to boolean, got: number/);
	});

	it('wraps a condition that throws', () => {
		const scheduler = new FlowScheduler(makeContext());
		const steps = [makeStep('a', { when: 'outputs.nope.field' })];
		expect(() => startAll(scheduler, steps)).toThrow(/Failed to evaluate condition/);
	});
});

describe('FlowScheduler -- onFailure.goto loops', () => {
	it('resets the loop budget of a step when its goto target completes and resetOnSuccess is set', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [
			makeStep('a'),
			makeStep('b', { depends: ['a'], onFailure: { goto: 'a', maxIterations: 1, resetOnSuccess: true } }),
		]);
		scheduler.acknowledge('a');
		succeed(scheduler, 'a');
		scheduler.acknowledge('b');
		expect(ids(fail(scheduler, 'b'))).toEqual(['a']);
		scheduler.acknowledge('a');
		expect(ids(succeed(scheduler, 'a'))).toEqual(['b']);
		scheduler.acknowledge('b');
		// Without the reset this second failure would exhaust the single iteration and fail the flow
		expect(ids(fail(scheduler, 'b'))).toEqual(['a']);
		expect(scheduler.hasFailed()).toBe(false);
	});

	it('fails the step terminally once the loop budget is spent without resetOnSuccess', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [
			makeStep('a'),
			makeStep('b', { depends: ['a'], onFailure: { goto: 'a', maxIterations: 1 } }),
		]);
		scheduler.acknowledge('a');
		succeed(scheduler, 'a');
		scheduler.acknowledge('b');
		fail(scheduler, 'b');
		scheduler.acknowledge('a');
		succeed(scheduler, 'a');
		scheduler.acknowledge('b');
		expect(fail(scheduler, 'b')).toEqual([]);
		expect(scheduler.hasFailed()).toBe(true);
	});

	it('leaves a skipOnLoop descendant of the goto target completed', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [
			makeStep('a'),
			makeStep('b', { depends: ['a'], onFailure: { goto: 'a' } }),
			makeStep('keep', { depends: ['a'], skipOnLoop: true }),
		]);
		scheduler.acknowledge('a');
		succeed(scheduler, 'a');
		scheduler.acknowledge('b');
		scheduler.acknowledge('keep');
		succeed(scheduler, 'keep', { kept: 1 });
		const ready = fail(scheduler, 'b');
		expect(ids(ready)).toEqual(['a']);
		scheduler.acknowledge('a');
		// keep is not re-queued: only b becomes ready again
		expect(ids(succeed(scheduler, 'a'))).toEqual(['b']);
		expect(scheduler.getOutputs().get('keep')).toEqual({ kept: 1 });
	});
});

describe('FlowScheduler -- sub-step strategy misuse', () => {
	function schedulerWithParentAndChildren(strategy: SubStepStrategy, childCount: number): FlowScheduler {
		const scheduler = new FlowScheduler(makeContext(), { extraStrategies: [strategy] });
		startAll(scheduler, [makeStep('parent', { subStepStrategy: strategy.name })]);
		scheduler.acknowledge('parent');
		scheduler.inject(Array.from({ length: childCount }, (_, i) => makeStep(`child-${i}`, { parent: 'parent' })));
		succeed(scheduler, 'parent');
		for (let i = 0; i < childCount; i++) scheduler.acknowledge(`child-${i}`);
		return scheduler;
	}

	it('throws when onChildFailure returns release-wave', () => {
		const scheduler = schedulerWithParentAndChildren(
			{
				name: 'bad-release',
				onChildFailure: () => ({ type: 'release-wave', wave: 1 }),
				onAllChildrenTerminal: () => ({ type: 'wait' }),
			},
			1
		);
		expect(() => fail(scheduler, 'child-0')).toThrow(/returned release-wave from onChildFailure/);
	});

	it('fails the parent when onAllChildrenTerminal returns fail-parent', () => {
		const scheduler = schedulerWithParentAndChildren(
			{
				name: 'fail-at-end',
				onChildFailure: () => ({ type: 'wait' }),
				onAllChildrenTerminal: () => ({ type: 'fail-parent', error: 'gave up' }),
			},
			2
		);
		expect(fail(scheduler, 'child-0')).toEqual([]);
		expect(scheduler.hasFailed()).toBe(false);
		succeed(scheduler, 'child-1');
		expect(scheduler.hasFailed()).toBe(true);
	});

	it('throws on an unknown strategy when the last child completes', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [makeStep('parent', { subStepStrategy: 'nonexistent' })]);
		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		succeed(scheduler, 'parent');
		scheduler.acknowledge('child');
		expect(() => succeed(scheduler, 'child')).toThrow('unknown sub-step strategy "nonexistent" on step "parent"');
	});
});

describe('FlowScheduler -- read accessors and reservations', () => {
	it('reports step count, ids and in-flight state', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [makeStep('a'), makeStep('b', { depends: ['a'] })]);
		scheduler.inject([makeStep('c')]);
		expect(scheduler.getStepCount()).toBe(3);
		expect([...scheduler.getStepIds()].sort()).toEqual(['a', 'b', 'c']);
		expect(scheduler.isInFlight('a')).toBe(false);
		scheduler.acknowledge('a');
		expect(scheduler.isInFlight('a')).toBe(true);
		scheduler.unacknowledge('a');
		expect(scheduler.isInFlight('a')).toBe(false);
	});

	it('exposes no sub-step data before any restart, then the failed sub-step after one', () => {
		const context = makeContext();
		const scheduler = new FlowScheduler(context);
		startAll(scheduler, [makeStep('parent')]);
		expect(scheduler.getSubSteps()).toBeUndefined();
		expect(scheduler.getSubStepErrors('parent')).toEqual([]);
		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBeUndefined();

		scheduler.acknowledge('parent');
		scheduler.inject([makeStep('child', { parent: 'parent' })]);
		succeed(scheduler, 'parent');
		scheduler.acknowledge('child');
		scheduler.complete('child', { type: 'failed', error: 'boom', outputs: { stderr: 'bad' } });

		expect(scheduler.getSubStepErrors('parent')).toEqual(['boom']);
		expect(scheduler.getSubSteps()?.get('child')).toEqual({
			outputs: { stderr: 'bad' },
			status: 'failed',
			error: 'boom',
		});
		expect(scheduler.getSubStepRelaunchFeedback('parent')).toBe('[child]\nbad');
	});

	it('assertInjectable accepts a plain step and refuses a waves sub-step without a wave', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [makeStep('parent', { subStepStrategy: 'waves' })]);
		expect(() => scheduler.assertInjectable(makeStep('plain'))).not.toThrow();
		expect(() => scheduler.assertInjectable(makeStep('child', { parent: 'parent' }))).toThrow(/needs a "wave"/);
	});

	it('resumeFailedStep refuses a step that has not failed', () => {
		const scheduler = new FlowScheduler(makeContext());
		startAll(scheduler, [makeStep('a')]);
		expect(() => scheduler.resumeFailedStep('a')).toThrow('is not failed');
	});
});
