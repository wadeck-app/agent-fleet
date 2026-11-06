import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';

describe('FakeClock', () => {
	it('starts at the given time and only moves when advanced', () => {
		const clock = new FakeClock(1000);

		expect(clock.now()).toBe(1000);
		clock.advance(250);
		clock.advance(0);
		expect(clock.now()).toBe(1250);
	});

	it('starts at zero by default', () => {
		expect(new FakeClock().now()).toBe(0);
	});

	it.each([[-1], [Number.NaN], [Infinity]])('refuses to advance by %s', amount => {
		expect(() => new FakeClock().advance(amount)).toThrow(
			'FakeClock.advance needs a non-negative number of milliseconds'
		);
	});
});
