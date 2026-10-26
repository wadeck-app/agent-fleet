import { describe, expect, it } from 'vitest';

import { formatClock, formatLong, formatMedium, formatShort, formatWeekday, isoTitle } from './DateText.js';

// 2026-10-24 is a Saturday.
const INSTANT = '2026-10-24T18:38:07.123Z';

// @formatter:off
const CASES: ReadonlyArray<{
	zone: string;
	weekday: string;
	short: string;
	medium: string;
	long: string;
	clock: string;
}> = [
	{
		zone: 'UTC',
		weekday: 'Sat',
		short: 'Oct 24',
		medium: 'Oct 24, 18:38',
		long: 'Sat, Oct 24, 2026, 18:38:07',
		clock: '18:38:07.123',
	},
	{
		zone: 'Asia/Tokyo',
		weekday: 'Sun',
		short: 'Oct 25',
		medium: 'Oct 25, 03:38',
		long: 'Sun, Oct 25, 2026, 03:38:07',
		clock: '03:38:07.123',
	},
	{
		zone: 'America/Los_Angeles',
		weekday: 'Sat',
		short: 'Oct 24',
		medium: 'Oct 24, 11:38',
		long: 'Sat, Oct 24, 2026, 11:38:07',
		clock: '11:38:07.123',
	},
];
// @formatter:on

describe('DateText: English, whatever the language and the time zone of the machine', () => {
	describe.each(CASES)('in $zone', ({ zone, weekday, short, medium, long, clock }) => {
		const options = { timeZone: zone };
		it('formats the weekday, the day, the day and time, the long form and the clock', () => {
			expect(formatWeekday(INSTANT, options)).toBe(weekday);
			expect(formatShort(INSTANT, options)).toBe(short);
			expect(formatMedium(INSTANT, options)).toBe(medium);
			expect(formatLong(INSTANT, options)).toBe(long);
			expect(formatClock(INSTANT, options)).toBe(clock);
		});
	});

	it('accepts a Date and an epoch number like an ISO text', () => {
		const options = { timeZone: 'UTC' };
		expect(formatMedium(new Date(INSTANT), options)).toBe('Oct 24, 18:38');
		expect(formatMedium(Date.parse(INSTANT), options)).toBe('Oct 24, 18:38');
	});

	it('uses a 24 hour clock that never prints 24:00 for midnight', () => {
		expect(formatMedium('2026-10-24T00:05:00.000Z', { timeZone: 'UTC' })).toBe('Oct 24, 00:05');
		expect(formatClock('2026-10-24T00:00:00.000Z', { timeZone: 'UTC' })).toBe('00:00:00.000');
	});

	it.each([
		['2026-10-19', 'Mon'],
		['2026-10-20', 'Tue'],
		['2026-10-21', 'Wed'],
		['2026-10-22', 'Thu'],
		['2026-10-23', 'Fri'],
		['2026-10-24', 'Sat'],
		['2026-10-25', 'Sun'],
	])('names %s with the 3 letter English weekday %s', (day, expected) => {
		expect(formatWeekday(`${day}T12:00:00.000Z`, { timeZone: 'UTC' })).toBe(expected);
	});

	it('uses the time zone of the machine when none is given (the zone is not the language)', () => {
		const local = new Date(2026, 9, 24, 18, 38, 7);
		expect(formatMedium(local)).toBe('Oct 24, 18:38');
		expect(formatWeekday(local)).toBe('Sat');
	});

	it('gives the exact instant for a tooltip', () => {
		expect(isoTitle(INSTANT)).toBe(INSTANT);
		expect(isoTitle(new Date(INSTANT))).toBe(INSTANT);
	});

	it.each(['', 'not a date', Number.NaN])('refuses %j and says how to fix it', value => {
		expect(() => formatMedium(value)).toThrow(/ISO 8601/);
		expect(() => isoTitle(value)).toThrow(/ISO 8601/);
	});
});
