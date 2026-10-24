/**
 * FlowScheduler -- `subStepStrategy: waves`.
 *
 * Sub-steps of a waves parent run in ordered waves: a wave runs in parallel, every member is awaited,
 * the next wave starts only when the previous one fully passed, and a failed wave restarts the parent
 * (from wave 1) with that wave's aggregated failures.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerStep } from './FlowScheduler';

function startFlow(steps: SchedulerStep[]): { scheduler: FlowScheduler; ready: ReadyItem[] } {
	const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
	// Mirrors DAGBuilder: a sub-step implicitly depends on its parent
	const depends = new Map(
		steps.map(s => {
			const explicit = s.depends ?? [];
			return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
		})
	);
	const ready = scheduler.start(steps, depends);
	return { scheduler, ready };
}

const ids = (items: ReadyItem[]): string[] => items.map(i => i.stepId).sort();

function succeed(scheduler: FlowScheduler, stepId: string): ReadyItem[] {
	scheduler.acknowledge(stepId);
	return scheduler.complete(stepId, { type: 'completed', outputs: {} });
}

function fail(scheduler: FlowScheduler, stepId: string, stderr = `${stepId} failed`): ReadyItem[] {
	scheduler.acknowledge(stepId);
	return scheduler.complete(stepId, { type: 'failed', error: stderr, outputs: { stderr } });
}

const parentStep = (extra: Partial<SchedulerStep> = {}): SchedulerStep => ({
	id: 'impl',
	subStepStrategy: 'waves',
	...extra,
});
const child = (id: string, wave: number, extra: Partial<SchedulerStep> = {}): SchedulerStep => ({
	id,
	parent: 'impl',
	wave,
	...extra,
});

/** impl + wave 1 (a1, a2), wave 2 (b1), wave 3 (c1), with impl already completed (children released). */
function threeWaves(parentExtra: Partial<SchedulerStep> = {}): { scheduler: FlowScheduler; afterParent: ReadyItem[] } {
	const { scheduler, ready } = startFlow([
		parentStep(parentExtra),
		child('a1', 1),
		child('a2', 1),
		child('b1', 2),
		child('c1', 3),
	]);
	expect(ids(ready)).toEqual(['impl']);
	return { scheduler, afterParent: succeed(scheduler, 'impl') };
}

describe('FlowScheduler -- subStepStrategy: waves', () => {
	it('waves: wave 2 children stay pending until every wave 1 child completed', () => {
		const { scheduler, afterParent } = threeWaves();
		expect(ids(afterParent)).toEqual(['a1', 'a2']);

		expect(ids(succeed(scheduler, 'a1'))).toEqual([]);
		expect(ids(succeed(scheduler, 'a2'))).toEqual(['b1']);
		expect(scheduler.isTerminal()).toBe(false);
	});

	it('waves: last wave passing completes the parent', () => {
		const { scheduler } = threeWaves();
		succeed(scheduler, 'a1');
		succeed(scheduler, 'a2');
		expect(ids(succeed(scheduler, 'b1'))).toEqual(['c1']);
		succeed(scheduler, 'c1');

		expect(scheduler.hasFailed()).toBe(false);
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('waves: gaps in numbering respect numeric order (3, 20, 100)', () => {
		const { scheduler, ready } = startFlow([parentStep(), child('late', 100), child('mid', 20), child('early', 3)]);
		expect(ids(ready)).toEqual(['impl']);
		expect(ids(succeed(scheduler, 'impl'))).toEqual(['early']);
		expect(ids(succeed(scheduler, 'early'))).toEqual(['mid']);
		expect(ids(succeed(scheduler, 'mid'))).toEqual(['late']);
		succeed(scheduler, 'late');
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('waves: wave 1 failure waits for all wave 1 siblings then restarts parent once', () => {
		const { scheduler } = threeWaves();

		// a1 fails while a2 is still running: nothing restarts yet
		expect(ids(fail(scheduler, 'a1'))).toEqual([]);
		expect(scheduler.hasFailed()).toBe(false);

		// a2 passes: the wave is over, the parent restarts, wave 2 never started
		expect(ids(succeed(scheduler, 'a2'))).toEqual(['impl']);
		expect(scheduler.hasFailed()).toBe(false);
	});

	it('waves: restart feedback contains only the failed wave failures, formatted [id]\\n<stderr>', () => {
		const { scheduler } = threeWaves();
		fail(scheduler, 'a1', 'a1 boom');
		fail(scheduler, 'a2', 'a2 bang');

		expect(scheduler.getSubStepRelaunchFeedback('impl')).toBe('[a1]\na1 boom\n\n[a2]\na2 bang');
	});

	it('waves: later waves are settled as not run with a wave reason when an earlier wave fails', () => {
		const { scheduler } = threeWaves();
		fail(scheduler, 'a1');
		succeed(scheduler, 'a2');

		expect(scheduler.takeSkippedSteps()).toEqual([
			{ stepId: 'b1', reason: 'not run: wave 1 failed, wave 2 was not started' },
			{ stepId: 'c1', reason: 'not run: wave 1 failed, wave 3 was not started' },
		]);
	});

	it('waves: parent restart re-runs from wave 1', () => {
		const { scheduler } = threeWaves();
		// Wave 1 passes, wave 2 fails: the parent restarts and wave 1 runs again before wave 2
		succeed(scheduler, 'a1');
		succeed(scheduler, 'a2');
		expect(ids(fail(scheduler, 'b1', 'b1 broke'))).toEqual(['impl']);
		expect(scheduler.getSubStepRelaunchFeedback('impl')).toBe('[b1]\nb1 broke');

		expect(ids(succeed(scheduler, 'impl'))).toEqual(['a1', 'a2']);
		expect(ids(succeed(scheduler, 'a1'))).toEqual([]);
		expect(ids(succeed(scheduler, 'a2'))).toEqual(['b1']);
		succeed(scheduler, 'b1');
		succeed(scheduler, 'c1');
		expect(scheduler.isTerminal()).toBe(true);
	});
});

describe('FlowScheduler -- subStepStrategy: waves, nesting and budget', () => {
	/** impl (waves) -> wave 1: a1 | wave 2: r1 (with nested v1) | wave 3: c1 */
	function withNestedReviewer(reviewerExtra: Partial<SchedulerStep> = {}): FlowScheduler {
		const { scheduler } = startFlow([
			parentStep(),
			child('a1', 1),
			child('r1', 2, reviewerExtra),
			{ id: 'v1', parent: 'r1' },
			child('c1', 3),
		]);
		succeed(scheduler, 'impl');
		succeed(scheduler, 'a1');
		return scheduler;
	}

	it('waves: nested sub-sub-steps run in the wave of their ancestor and delay the next wave', () => {
		const scheduler = withNestedReviewer();
		// r1 ran: its nested validator runs now, wave 3 must keep waiting
		expect(ids(succeed(scheduler, 'r1'))).toEqual(['v1']);
		expect(scheduler.isTerminal()).toBe(false);

		// v1 passes -> r1 settles -> wave 2 is over -> wave 3 starts
		expect(ids(succeed(scheduler, 'v1'))).toEqual(['c1']);
		succeed(scheduler, 'c1');
		expect(scheduler.isTerminal()).toBe(true);
		expect(scheduler.hasFailed()).toBe(false);
	});

	it('waves: nested sub-step failure fails its wave reviewer then restarts the parent with wave feedback', () => {
		const scheduler = withNestedReviewer({ maxSubStepIterations: 1 });
		succeed(scheduler, 'r1');

		// v1 fails once: r1 (budget 1) is relaunched and v1 is re-queued behind it
		expect(ids(fail(scheduler, 'v1', 'v1 first'))).toEqual(['r1']);
		expect(ids(succeed(scheduler, 'r1'))).toEqual(['v1']);

		// v1 fails again: r1's budget is exhausted, r1 fails inside wave 2 and restarts impl
		expect(ids(fail(scheduler, 'v1', 'v1 second'))).toEqual(['impl']);
		expect(scheduler.hasFailed()).toBe(false);
		expect(scheduler.getSubStepRelaunchFeedback('impl')).toContain('[r1]\n');
		expect(scheduler.getSubStepRelaunchFeedback('impl')).toContain('v1 second');
		expect(scheduler.takeSkippedSteps()).toEqual([
			{ stepId: 'c1', reason: 'not run: wave 2 failed, wave 3 was not started' },
		]);

		// The restart re-runs everything below impl, nested validator included
		expect(ids(succeed(scheduler, 'impl'))).toEqual(['a1']);
		expect(ids(succeed(scheduler, 'a1'))).toEqual(['r1']);
		expect(ids(succeed(scheduler, 'r1'))).toEqual(['v1']);
		expect(ids(succeed(scheduler, 'v1'))).toEqual(['c1']);
		succeed(scheduler, 'c1');
		expect(scheduler.isTerminal()).toBe(true);
	});
});

describe('FlowScheduler -- subStepStrategy: waves, retry, budget, failures and resets', () => {
	it('waves: sub-step retry does not end the wave', () => {
		const { scheduler } = startFlow([
			parentStep(),
			child('a1', 1, { retry: { maxAttempts: 1, backoff: 'linear' } }),
			child('a2', 1),
			child('b1', 2),
		]);
		succeed(scheduler, 'impl');
		// a1 fails but is retried: it is not failed yet, the wave goes on
		expect(ids(fail(scheduler, 'a1'))).toEqual(['a1']);
		expect(ids(succeed(scheduler, 'a2'))).toEqual([]);
		// the retry passes: only now does wave 2 start, and the parent was never relaunched
		expect(ids(succeed(scheduler, 'a1'))).toEqual(['b1']);
		expect(scheduler.getSubStepRelaunchFeedback('impl')).toBeUndefined();
	});

	it('waves: a wave failure shares the parent maxSubStepIterations budget and names the wave when exhausted', () => {
		const { scheduler } = startFlow([parentStep({ maxSubStepIterations: 2 }), child('a1', 1), child('b1', 2)]);
		succeed(scheduler, 'impl');
		succeed(scheduler, 'a1');
		// wave 2 fails: iteration 1
		expect(ids(fail(scheduler, 'b1', 'b1 boom'))).toEqual(['impl']);
		succeed(scheduler, 'impl');
		// wave 1 fails on the way back: iteration 2
		expect(ids(fail(scheduler, 'a1', 'a1 boom'))).toEqual(['impl']);
		succeed(scheduler, 'impl');
		succeed(scheduler, 'a1');
		// wave 2 fails again: the third wave failure exceeds the budget of 2
		expect(ids(fail(scheduler, 'b1', 'b1 again'))).toEqual([]);

		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.takeParentFailures()).toEqual([
			{ stepId: 'impl', message: "Sub-step 'b1' failed in wave 2 after 2 re-run(s): b1 again" },
		]);
	});

	it('waves: engine-origin failure fails the parent without starting later waves or relaunching', () => {
		const { scheduler } = threeWaves();
		succeed(scheduler, 'a1');
		scheduler.acknowledge('a2');
		const ready = scheduler.complete('a2', { type: 'failed', error: 'worker lost', origin: 'engine' });

		expect(ids(ready)).toEqual([]);
		expect(scheduler.hasFailed()).toBe(true);
		expect(scheduler.getSubStepRelaunchFeedback('impl')).toBeUndefined();
		expect(scheduler.takeParentFailures()).toHaveLength(1);
	});

	it('waves: a wave whose members are all skipped by when does not hang the next wave', () => {
		const { scheduler } = startFlow([
			parentStep(),
			child('a1', 1),
			child('skipped', 2, { when: 'false' }),
			child('c1', 3),
		]);
		succeed(scheduler, 'impl');
		expect(ids(succeed(scheduler, 'a1'))).toEqual(['c1']);
		succeed(scheduler, 'c1');
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('waves: a first wave whose members are all skipped by when starts the second wave', () => {
		const { scheduler } = startFlow([parentStep(), child('skipped', 1, { when: 'false' }), child('b1', 2)]);
		expect(ids(succeed(scheduler, 'impl'))).toEqual(['b1']);
	});

	it('waves: loop reset clears wave state', () => {
		const { scheduler, ready } = startFlow([
			{ id: 'setup' },
			parentStep({ depends: ['setup'] }),
			child('a1', 1),
			child('b1', 2),
			{ id: 'check', depends: ['impl'], onFailure: { goto: 'setup' } },
		]);
		expect(ids(ready)).toEqual(['setup']);
		succeed(scheduler, 'setup');
		succeed(scheduler, 'impl');
		succeed(scheduler, 'a1');
		// wave 2 is the running wave when the loop fires
		succeed(scheduler, 'b1');
		expect(ids(fail(scheduler, 'check'))).toEqual(['setup']);

		succeed(scheduler, 'setup');
		// impl runs again; wave 2 must be held again, behind wave 1
		expect(ids(succeed(scheduler, 'impl'))).toEqual(['a1']);
		expect(ids(succeed(scheduler, 'a1'))).toEqual(['b1']);
		succeed(scheduler, 'b1');
		succeed(scheduler, 'check');
		expect(scheduler.isTerminal()).toBe(true);
	});

	describe('injected sub-steps', () => {
		it('waves: rejects an injected sub-step without a wave, naming the fix', () => {
			const { scheduler } = startFlow([parentStep()]);
			scheduler.acknowledge('impl');
			expect(() => scheduler.inject([{ id: 'x', parent: 'impl' }])).toThrow(
				'sub-step "x" of "impl" (subStepStrategy: waves) needs a "wave" that is a non-negative integer, got undefined. Add e.g. "wave: 1" to "x".'
			);
			// nothing was registered
			expect(scheduler.getStepIds().has('x')).toBe(false);
		});

		it('waves: injected sub-steps are held by wave until the parent completes', () => {
			const { scheduler } = startFlow([parentStep()]);
			scheduler.acknowledge('impl');
			scheduler.inject([child('x2', 2), child('x1', 1)]);
			expect(ids(succeed(scheduler, 'impl'))).toEqual(['x1']);
			expect(ids(succeed(scheduler, 'x1'))).toEqual(['x2']);
		});

		it('waves: an injected sub-step of the running wave starts at once, one of an earlier wave is rejected', () => {
			const { scheduler } = startFlow([parentStep(), child('a1', 2), child('b1', 3)]);
			succeed(scheduler, 'impl');
			expect(ids(scheduler.inject([{ id: 'late', parent: 'impl', wave: 2 }]))).toEqual(['late']);
			expect(() => scheduler.inject([{ id: 'old', parent: 'impl', wave: 1 }])).toThrow(
				'declares wave 1 but wave 2 is already running'
			);
		});
	});
});

/**
 * Mirrors _test-flow/.flow/.tmp/golden-test/waves.yml re-expressed with `wave:` instead of the wait-all +
 * `depends` emulation. Each script fails the first time it ever runs (it touches a flag file, as the real
 * scripts do) and passes afterwards.
 */
describe('FlowScheduler -- golden waves.yml shape expressed with wave', () => {
	const failsOnFirstRun: Record<string, string> = {
		w1_a: 'W1A failed (see wv_w1a)',
		w1_b: 'W1B failed',
		w2_val: 'W2VAL invalid report',
		w2_gate_rev: 'W2 GATE1 blocking finding',
		w2_other: 'W2 OTHER failed',
	};

	const goldenSteps: SchedulerStep[] = [
		{ id: 'impl', subStepStrategy: 'waves', maxSubStepIterations: 3 },
		{ id: 'w1_a', parent: 'impl', wave: 1 },
		{ id: 'w1_b', parent: 'impl', wave: 1 },
		{ id: 'w2_rev', parent: 'impl', wave: 2, maxSubStepIterations: 2 },
		{ id: 'w2_val', parent: 'w2_rev' },
		{ id: 'w2_gate_rev', parent: 'impl', wave: 2 },
		{ id: 'w2_other', parent: 'impl', wave: 2 },
		{ id: 'w3_e2e', parent: 'impl', wave: 3 },
	];

	/** Runs the scheduler like the daemon would: first in, first out, one outcome per dispatch. */
	function runToEnd(
		scheduler: FlowScheduler,
		initial: ReadyItem[]
	): { log: string[]; feedbacks: (string | undefined)[] } {
		const log: string[] = [];
		const feedbacks: (string | undefined)[] = [];
		const runs = new Map<string, number>();
		const queue = [...initial];
		while (queue.length > 0) {
			const { stepId } = queue.shift() as ReadyItem;
			if (stepId === 'impl') feedbacks.push(scheduler.getSubStepRelaunchFeedback('impl'));
			log.push(stepId);
			const run = (runs.get(stepId) ?? 0) + 1;
			runs.set(stepId, run);
			scheduler.acknowledge(stepId);
			const stderr = failsOnFirstRun[stepId];
			queue.push(
				...(stderr !== undefined && run === 1
					? scheduler.complete(stepId, { type: 'failed', error: stderr, outputs: { stderr } })
					: scheduler.complete(stepId, { type: 'completed', outputs: {} }))
			);
			if (log.length > 100) throw new Error(`runaway scheduler, log so far: ${log.join(',')}`);
		}
		return { log, feedbacks };
	}

	it('runs three rounds: wave 1 fails, wave 2 (nested validator, gate, other) fails, then everything passes', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const depends = new Map(goldenSteps.map(s => [s.id, s.parent ? [s.parent] : []]));
		const { log, feedbacks } = runToEnd(scheduler, scheduler.start(goldenSteps, depends));

		expect(scheduler.hasFailed()).toBe(false);
		expect(scheduler.isTerminal()).toBe(true);

		const count = (id: string): number => log.filter(l => l === id).length;
		expect(count('impl')).toBe(3);
		expect(count('w1_a')).toBe(3);
		expect(count('w1_b')).toBe(3);
		// round 2: reviewer, validator fails, reviewer relaunched, validator again; round 3: both once
		expect(count('w2_rev')).toBe(3);
		expect(count('w2_val')).toBe(3);
		expect(count('w2_gate_rev')).toBe(2);
		expect(count('w2_other')).toBe(2);
		// wave 3 runs once, after the last wave 2 member of the last round
		expect(count('w3_e2e')).toBe(1);
		const lastRoundStart = log.lastIndexOf('impl');
		const w3At = log.indexOf('w3_e2e');
		expect(w3At).toBeGreaterThan(lastRoundStart);
		for (const wave2 of ['w2_rev', 'w2_val', 'w2_gate_rev', 'w2_other']) {
			expect(log.lastIndexOf(wave2)).toBeLessThan(w3At);
		}

		// Relaunch feedback of each round: wave 1 failures, then wave 2 failures (gate + other, not the validator)
		expect(feedbacks[0]).toBeUndefined();
		expect(feedbacks[1]).toBe('[w1_a]\nW1A failed (see wv_w1a)\n\n[w1_b]\nW1B failed');
		expect(feedbacks[2]).toContain('[w2_gate_rev]\nW2 GATE1 blocking finding');
		expect(feedbacks[2]).toContain('[w2_other]\nW2 OTHER failed');
		expect(feedbacks[2]).not.toContain('W2VAL');
		expect(feedbacks[2]).not.toContain('W1');
	});
});
