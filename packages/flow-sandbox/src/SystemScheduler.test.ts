import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMER_DELAY_MS, SystemScheduler } from './SystemScheduler';
import { eachRow } from './testing/EachRow';

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

	it('refuses the delay (each case) instead of letting setTimeout fire at once', () =>
		eachRow([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [MAX_TIMER_DELAY_MS + 1]], delay => {
			expect(() => new SystemScheduler().schedule(delay, () => undefined)).toThrow(RangeError);
		}));
});
