/**
 * A restarted parent resets EVERY sub-step below it, nested ones included, to a clean slate -- also the
 * ones settled as "not run" in the failed round. Otherwise a stale settled sub-step (a nested validator, a
 * gate depending on it) never runs again, and the next round can neither finish nor relaunch the parent.
 *
 * Shape (wave 1 fails, wave 2 has a nested validator and a gate, wave 2 then fails, third round green):
 *   wave 1: w1_a, w1_b | wave 2: w2_rev (nested w2_val), w2_gate (after w2_val), w2_other | wave 3: w3
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerStep } from './FlowScheduler';

function start(steps: SchedulerStep[]): { scheduler: FlowScheduler; ready: ReadyItem[] } {
	const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
	const depends = new Map(
		steps.map(s => {
			const explicit = s.depends ?? [];
			return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
		})
	);
	return { scheduler, ready: scheduler.start(steps, depends) };
}
const ids = (items: ReadyItem[]): string[] => items.map(i => i.stepId).sort();
const ok = (s: FlowScheduler, id: string): ReadyItem[] => {
	s.acknowledge(id);
	return s.complete(id, { type: 'completed', outputs: {} });
};
const ko = (s: FlowScheduler, id: string, stderr: string): ReadyItem[] => {
	s.acknowledge(id);
	return s.complete(id, { type: 'failed', error: stderr, outputs: { stderr } });
};

const NOT_RUN = ['w2_gate', 'w2_other', 'w2_rev', 'w2_val', 'w3'];

/** The same flow written for one strategy: `wait-all` + `depends` emulation, or `waves`. */
function flowFor(strategy: 'wait-all' | 'waves'): SchedulerStep[] {
	const sub = (id: string, wave: number, extra: Partial<SchedulerStep> = {}): SchedulerStep =>
		strategy === 'waves' ? { id, parent: 'impl', wave, ...extra } : { id, parent: 'impl', ...extra };
	const afterWave1 = strategy === 'waves' ? {} : { depends: ['w1_a', 'w1_b'] };
	return [
		{ id: 'impl', subStepStrategy: strategy },
		sub('w1_a', 1),
		sub('w1_b', 1),
		sub('w2_rev', 2, afterWave1),
		{ id: 'w2_val', parent: 'w2_rev' },
		sub('w2_gate', 2, strategy === 'waves' ? {} : { depends: ['w2_val'] }),
		sub('w2_other', 2, afterWave1),
		sub('w3', 3, strategy === 'waves' ? {} : { depends: ['w2_gate', 'w2_other'] }),
	];
}

describe.each(['wait-all', 'waves'] as const)('FlowScheduler -- restart resets every sub-step (%s)', strategy => {
	it('runs a nested validator and its gate again in the next round and relaunches on the new failures', () => {
		const { scheduler, ready } = start(flowFor(strategy));
		expect(ids(ready)).toEqual(['impl']);
		ok(scheduler, 'impl');

		// Round 1: wave 1 fails entirely, everything after it is settled as not run
		ko(scheduler, 'w1_a', 'W1A failed');
		expect(ids(ko(scheduler, 'w1_b', 'W1B failed'))).toEqual(['impl']);
		expect(
			scheduler
				.takeSkippedSteps()
				.map(s => s.stepId)
				.sort()
		).toEqual(NOT_RUN);
		expect(scheduler.takeRequeuedSteps().sort()).toEqual(['w1_a', 'w1_b', ...NOT_RUN].sort());

		// Round 2: wave 1 passes, wave 2 starts with the reviewer (and, wait-all, its sibling)
		ok(scheduler, 'impl');
		ok(scheduler, 'w1_a');
		const afterWave1 = ok(scheduler, 'w1_b');
		expect(ids(afterWave1)).toEqual(['w2_other', 'w2_rev'].concat(strategy === 'waves' ? ['w2_gate'] : []).sort());

		// The reviewer's nested validator runs again (it was settled as not run in round 1)
		expect(ids(ok(scheduler, 'w2_rev'))).toEqual(['w2_val']);
		ko(scheduler, 'w2_other', 'W2 OTHER failed');
		const afterValidator = ok(scheduler, 'w2_val');
		const gateReady = strategy === 'waves' ? afterValidator : afterValidator;
		if (strategy === 'wait-all') {
			// depends: the gate only starts once the validator passed
			expect(ids(gateReady)).toEqual(['w2_gate']);
		}
		// The gate fails too: both failures of THIS wave are reported together, and the parent is relaunched
		const relaunch = ko(scheduler, 'w2_gate', 'W2 GATE blocking finding');
		expect(ids(relaunch)).toEqual(['impl']);
		expect(scheduler.hasFailed()).toBe(false);
		const feedback = scheduler.getSubStepRelaunchFeedback('impl') as string;
		expect(feedback).toContain('W2 OTHER failed');
		expect(feedback).toContain('W2 GATE blocking finding');
		expect(feedback).not.toContain('W1A');
		expect(scheduler.takeSkippedSteps().map(s => s.stepId)).toContain('w3');

		// Round 3: green all the way; wave 3 only after a fully green wave 2
		ok(scheduler, 'impl');
		ok(scheduler, 'w1_a');
		ok(scheduler, 'w1_b');
		ok(scheduler, 'w2_rev');
		ok(scheduler, 'w2_val');
		ok(scheduler, 'w2_gate');
		const wave3 = ok(scheduler, 'w2_other');
		expect(ids(wave3)).toEqual(['w3']);
		ok(scheduler, 'w3');
		expect(scheduler.isTerminal()).toBe(true);
		expect(scheduler.hasFailed()).toBe(false);
	});
});

describe('FlowScheduler -- takeRequeuedSteps', () => {
	it('is empty before any restart and returns each requeued sub-step once', () => {
		const { scheduler } = start([
			{ id: 'p', subStepStrategy: 'wait-all' },
			{ id: 'c', parent: 'p' },
		]);
		expect(scheduler.takeRequeuedSteps()).toEqual([]);
		ok(scheduler, 'p');
		ko(scheduler, 'c', 'boom');
		expect(scheduler.takeRequeuedSteps()).toEqual(['c']);
		expect(scheduler.takeRequeuedSteps()).toEqual([]);
	});
});
