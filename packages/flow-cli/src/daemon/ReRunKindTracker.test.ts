import { describe, expect, it } from 'vitest';

import { ReRunKindTracker } from './ReRunKindTracker';

const schedulerWith = (counts: Record<string, number>) => {
	const state = { ...counts };
	return { state, scheduler: { getRetryCount: (stepId: string) => state[stepId] ?? 0 } };
};

describe('ReRunKindTracker', () => {
	it('says retry when the scheduler granted a retry since the step last started, loop otherwise', () => {
		const { state, scheduler } = schedulerWith({});
		const tracker = new ReRunKindTracker();

		// first start: nothing granted
		expect(tracker.kindFor(scheduler, 'a')).toBe('loop');
		// the scheduler retries the step
		state['a'] = 1;
		expect(tracker.kindFor(scheduler, 'a')).toBe('retry');
		// started again with no new retry: a loop / round restart
		expect(tracker.kindFor(scheduler, 'a')).toBe('loop');
		state['a'] = 2;
		expect(tracker.kindFor(scheduler, 'a')).toBe('retry');
	});

	it('follows each step and each scheduler on its own', () => {
		const one = schedulerWith({ a: 1 });
		const two = schedulerWith({ a: 0 });
		const tracker = new ReRunKindTracker();

		expect(tracker.kindFor(one.scheduler, 'a')).toBe('retry');
		expect(tracker.kindFor(two.scheduler, 'a')).toBe('loop');
		expect(tracker.kindFor(one.scheduler, 'b')).toBe('loop');
	});

	it('says loop when no scheduler is known: the kind of a re-run cannot be told', () => {
		expect(new ReRunKindTracker().kindFor(undefined, 'a')).toBe('loop');
	});
});
