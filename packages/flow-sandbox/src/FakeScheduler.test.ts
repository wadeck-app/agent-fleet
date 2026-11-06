import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeScheduler } from './FakeScheduler';

describe('FakeScheduler', () => {
	it('fires nothing before the delay and fires once when it has elapsed', () => {
		const clock = new FakeClock(100);
		const scheduler = new FakeScheduler(clock);
		const fired: number[] = [];
		scheduler.schedule(50, () => fired.push(clock.now()));

		scheduler.advance(49);
		expect(fired).toEqual([]);
		expect(scheduler.pendingCount).toBe(1);

		scheduler.advance(1);
		expect(fired).toEqual([150]);
		expect(scheduler.pendingCount).toBe(0);

		scheduler.advance(1000);
		expect(fired).toEqual([150]);
		expect(clock.now()).toBe(1150);
	});

	it('fires in due order with the clock at each due moment', () => {
		const clock = new FakeClock(0);
		const scheduler = new FakeScheduler(clock);
		const fired: string[] = [];
		scheduler.schedule(30, () => fired.push(`b@${clock.now()}`));
		scheduler.schedule(10, () => fired.push(`a@${clock.now()}`));
		scheduler.schedule(30, () => fired.push(`c@${clock.now()}`));

		scheduler.advance(100);

		expect(fired).toEqual(['a@10', 'b@30', 'c@30']);
		expect(clock.now()).toBe(100);
	});

	it('fires a callback scheduled by a callback when it falls inside the advance', () => {
		const clock = new FakeClock(0);
		const scheduler = new FakeScheduler(clock);
		const fired: string[] = [];
		scheduler.schedule(10, () => {
			fired.push('first');
			scheduler.schedule(10, () => fired.push('second'));
		});

		scheduler.advance(25);

		expect(fired).toEqual(['first', 'second']);
	});

	it('does not fire a cancelled callback and tolerates cancelling twice', () => {
		const scheduler = new FakeScheduler(new FakeClock());
		const fired: string[] = [];
		const cancel = scheduler.schedule(10, () => fired.push('x'));

		cancel();
		cancel();
		scheduler.advance(100);

		expect(fired).toEqual([]);
		expect(scheduler.pendingCount).toBe(0);
	});

	it('refuses a negative or non-finite delay', () => {
		const scheduler = new FakeScheduler(new FakeClock());

		expect(() => scheduler.schedule(-1, () => undefined)).toThrow('non-negative delay');
		expect(() => scheduler.schedule(Number.NaN, () => undefined)).toThrow('non-negative delay');
	});
});
