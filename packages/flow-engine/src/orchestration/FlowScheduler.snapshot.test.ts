/**
 * FlowScheduler.snapshot / restore: a scheduler rebuilt from its JSON snapshot behaves exactly like the original one.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerContext, SchedulerStep } from './FlowScheduler';
import { SCHEDULER_SNAPSHOT_VERSION } from './SchedulerSnapshotCodec';

function contextOf(): SchedulerContext {
	return { inputs: {}, stepOutputs: new Map(), subStepErrors: new Map() };
}

function startFlow(steps: SchedulerStep[]): {
	scheduler: FlowScheduler;
	ready: ReadyItem[];
	context: SchedulerContext;
} {
	const context = contextOf();
	const scheduler = new FlowScheduler(context);
	const depends = new Map(
		steps.map(s => {
			const explicit = s.depends ?? [];
			return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
		})
	);
	return { scheduler, ready: scheduler.start(steps, depends), context };
}

const ids = (items: ReadyItem[]): string[] => items.map(i => i.stepId).sort();

function succeed(scheduler: FlowScheduler, stepId: string, outputs: Record<string, unknown> = {}): ReadyItem[] {
	scheduler.acknowledge(stepId);
	return scheduler.complete(stepId, { type: 'completed', outputs });
}

function fail(scheduler: FlowScheduler, stepId: string): ReadyItem[] {
	scheduler.acknowledge(stepId);
	return scheduler.complete(stepId, {
		type: 'failed',
		error: `${stepId} failed`,
		outputs: { stderr: `${stepId} failed` },
	});
}

/** What a restarted daemon does: JSON on disk, a new scheduler, restore. */
function restoreFrom(scheduler: FlowScheduler): {
	restored: FlowScheduler;
	lost: ReadyItem[];
	context: SchedulerContext;
} {
	const parsed: unknown = JSON.parse(JSON.stringify(scheduler.snapshot()));
	const context = contextOf();
	const restored = new FlowScheduler(context);
	return { restored, lost: restored.restore(parsed), context };
}

/** The snapshot with what a restore changes on purpose (no step is in flight any more). */
function comparable(scheduler: FlowScheduler): unknown {
	return { ...scheduler.snapshot(), inFlightSteps: [] };
}

describe('FlowScheduler snapshot / restore', () => {
	it('a waves parent between two waves continues with the same steps; the in-flight step comes back as lost', () => {
		const { scheduler } = startFlow([
			{ id: 'impl', subStepStrategy: 'waves' },
			{ id: 'a1', parent: 'impl', wave: 1 },
			{ id: 'b1', parent: 'impl', wave: 2 },
			{ id: 'c1', parent: 'impl', wave: 3 },
			{ id: 'after', depends: ['impl'] },
		]);
		succeed(scheduler, 'impl');
		expect(ids(succeed(scheduler, 'a1'))).toEqual(['b1']);
		scheduler.acknowledge('b1');

		const { restored, lost } = restoreFrom(scheduler);

		expect(ids(lost)).toEqual(['b1']);
		expect(restored.isInFlight('b1')).toBe(false);
		expect(comparable(restored)).toEqual(comparable(scheduler));
		// Same continuation as the original
		expect(ids(succeed(restored, 'b1'))).toEqual(['c1']);
		expect(ids(succeed(scheduler, 'b1'))).toEqual(['c1']);
		expect(ids(succeed(restored, 'c1'))).toEqual(['after']);
		succeed(restored, 'after');
		expect(restored.isTerminal()).toBe(true);
		expect(restored.hasFailed()).toBe(false);
	});

	it('keeps the retry and goto-loop budgets already spent, and the outputs of the completed steps', () => {
		const { scheduler } = startFlow([
			{ id: 'build', retry: { maxAttempts: 1 } as SchedulerStep['retry'] },
			{
				id: 'test',
				depends: ['build'],
				onFailure: { goto: 'build', maxIterations: 1 } as SchedulerStep['onFailure'],
			},
			{ id: 'ship', depends: ['test'] },
		]);
		succeed(scheduler, 'build', { artifact: 'v1' });
		// One loop spent: build is ready again, nobody dispatched it yet (the queue of the consumer holds it)
		expect(ids(fail(scheduler, 'test'))).toEqual(['build']);
		expect(scheduler.getOutputs().has('build')).toBe(false);
		fail(scheduler, 'build');
		expect(scheduler.getRetryCount('build')).toBe(1);

		const { restored, lost } = restoreFrom(scheduler);

		expect(lost).toEqual([]);
		expect(restored.getRetryCount('build')).toBe(1);
		expect(comparable(restored)).toEqual(comparable(scheduler));
		for (const subject of [restored, scheduler]) {
			expect(ids(succeed(subject, 'build', { artifact: 'v2' }))).toEqual(['test']);
			// The loop budget (1) is spent: the second failure of test ends the run
			expect(fail(subject, 'test')).toEqual([]);
			expect(subject.hasFailed()).toBe(true);
		}
	});

	it('keeps the sub-step relaunch state of a parent and an injected step', () => {
		const { scheduler, context } = startFlow([
			{ id: 'impl' },
			{ id: 'check', parent: 'impl' },
			{ id: 'done', depends: ['impl'] },
		]);
		succeed(scheduler, 'impl', { code: 'v1' });
		scheduler.inject([{ id: 'extra', depends: ['impl'] }]);
		// The sub-step fails: the parent is re-queued with the feedback
		expect(ids(fail(scheduler, 'check'))).toEqual(['impl']);
		expect(context.subStepErrors?.get('impl')).toHaveLength(1);

		const { restored, context: restoredContext } = restoreFrom(scheduler);

		expect(restoredContext.subStepErrors?.get('impl')).toEqual(context.subStepErrors?.get('impl'));
		expect(restored.getSubStepRelaunchFeedback('impl')).toBe(scheduler.getSubStepRelaunchFeedback('impl'));
		expect(restored.getSubStepRelaunchFeedback('impl')).toBeDefined();
		expect(restored.getStepIds()).toEqual(new Set(['impl', 'check', 'done', 'extra']));
		expect(comparable(restored)).toEqual(comparable(scheduler));
		// Both finish the same way
		for (const subject of [restored, scheduler]) {
			succeed(subject, 'impl');
			succeed(subject, 'check');
			succeed(subject, 'extra');
			succeed(subject, 'done');
			expect(subject.isTerminal()).toBe(true);
		}
	});

	it('a completed step is not handed out again', () => {
		const { scheduler } = startFlow([{ id: 's1' }, { id: 's2', depends: ['s1'] }]);
		succeed(scheduler, 's1', { out: 1 });
		const { restored, lost } = restoreFrom(scheduler);
		expect(lost).toEqual([]);
		expect(restored.getOutputs().get('s1')).toEqual({ out: 1 });
		expect(restored.isTerminal()).toBe(false);
		// s2 was handed to the queue before the snapshot: the scheduler alone must not hand it out again
		expect(ids(restored.inject([]))).toEqual([]);
	});

	describe('refusals', () => {
		const snapshotOf = (): Record<string, unknown> => {
			const { scheduler } = startFlow([{ id: 's1' }]);
			return JSON.parse(JSON.stringify(scheduler.snapshot())) as Record<string, unknown>;
		};

		it('an unknown version names both versions', () => {
			const snapshot = { ...snapshotOf(), version: SCHEDULER_SNAPSHOT_VERSION + 1 };
			expect(() => new FlowScheduler(contextOf()).restore(snapshot)).toThrow(
				new RegExp(
					`version ${String(SCHEDULER_SNAPSHOT_VERSION + 1)}.*reads version ${String(SCHEDULER_SNAPSHOT_VERSION)}`
				)
			);
		});

		it('a damaged field is named and the scheduler is left untouched', () => {
			const snapshot = { ...snapshotOf(), completedSteps: 'nope' };
			const scheduler = new FlowScheduler(contextOf());
			expect(() => scheduler.restore(snapshot)).toThrow(/"completedSteps" must be a list of strings/);
			expect(scheduler.getStepCount()).toBe(0);
		});

		it('a missing section is named', () => {
			const { waves: _waves, ...snapshot } = snapshotOf();
			expect(() => new FlowScheduler(contextOf()).restore(snapshot)).toThrow(/"waves" must be an object/);
		});

		it('not an object', () => {
			expect(() => new FlowScheduler(contextOf()).restore('x')).toThrow(/"snapshot" must be an object/);
		});

		it('a scheduler that already started cannot be restored into', () => {
			const { scheduler } = startFlow([{ id: 's1' }]);
			expect(() => scheduler.restore(snapshotOf())).toThrow(/already started/);
		});

		it('an in-flight step that is not a step of the snapshot is refused', () => {
			const snapshot = { ...snapshotOf(), inFlightSteps: ['ghost'] };
			expect(() => new FlowScheduler(contextOf()).restore(snapshot)).toThrow(/in-flight step "ghost"/);
		});
	});
});
