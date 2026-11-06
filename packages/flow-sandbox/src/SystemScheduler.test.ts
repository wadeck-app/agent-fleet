import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMER_DELAY_MS, SystemScheduler } from './SystemScheduler';

describe('SystemScheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('runs the callback once after the delay', () => {
		const callback = vi.fn();
		new SystemScheduler().schedule(1000, callback);

		vi.advanceTimersByTime(999);
		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(5000);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does not run a cancelled callback', () => {
		const callback = vi.fn();
		const cancel = new SystemScheduler().schedule(1000, callback);

		cancel();
		vi.advanceTimersByTime(5000);

		expect(callback).not.toHaveBeenCalled();
	});

	it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [MAX_TIMER_DELAY_MS + 1]])(
		'refuses the delay %s instead of letting setTimeout fire at once',
		delay => {
			expect(() => new SystemScheduler().schedule(delay, () => undefined)).toThrow(RangeError);
		}
	);
});
