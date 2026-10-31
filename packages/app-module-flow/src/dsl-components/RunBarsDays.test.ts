import { DEFAULT_DATE_SETTINGS, createDateFormatter } from '@wadeck-app/dsl-ui';
import { describe, expect, it } from 'vitest';

import { type RunBarsRun, bucketRunsByDay } from './RunBarsDays.js';

const zone = (timeZone: string, locale = 'en-GB') =>
	createDateFormatter({ ...DEFAULT_DATE_SETTINGS, timeZone, locale });
const run = (startedAt: string, status: RunBarsRun['status'] = 'completed'): RunBarsRun => ({
	startedAt: new Date(startedAt),
	status,
});
const dates = (days: { date: string }[]) => days.map(day => day.date);
const counts = (days: { date: string; completed: number; failed: number }[]) =>
	Object.fromEntries(
		days.filter(day => day.completed + day.failed > 0).map(day => [day.date, [day.completed, day.failed]])
	);

describe('bucketRunsByDay', () => {
	const NOW = Date.parse('2026-10-25T12:00:00.000Z');

	it('returns seven zero-filled days ending today, oldest first, when nothing ran', () => {
		const days = bucketRunsByDay([], NOW, zone('UTC'));
		expect(dates(days)).toEqual([
			'2026-10-19',
			'2026-10-20',
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25',
		]);
		expect(days.every(day => day.completed === 0 && day.failed === 0)).toBe(true);
	});

	it('splits UTC days at UTC midnight and counts completed and failed apart', () => {
		const days = bucketRunsByDay(
			[
				run('2026-10-24T23:59:59.999Z'),
				run('2026-10-25T00:00:00.000Z', 'failed'),
				run('2026-10-25T08:00:00.000Z'),
				run('2026-10-25T09:00:00.000Z', 'failed'),
			],
			NOW,
			zone('UTC')
		);
		expect(counts(days)).toEqual({ '2026-10-24': [1, 0], '2026-10-25': [1, 2] });
	});

	it('moves the same runs to the next day in a zone far ahead of UTC (Pacific/Kiritimati, UTC+14), where today is already the 26th', () => {
		const runs = [
			run('2026-10-24T09:59:59.999Z'),
			run('2026-10-24T10:00:00.000Z'),
			run('2026-10-25T09:59:00.000Z', 'failed'),
		];
		const kiritimati = bucketRunsByDay(runs, NOW, zone('Pacific/Kiritimati'));
		expect(dates(kiritimati).at(-1)).toBe('2026-10-26');
		expect(dates(kiritimati)[0]).toBe('2026-10-20');
		// 09:59:59Z is 23:59:59 on the 24th there, 10:00Z is midnight of the 25th.
		expect(counts(kiritimati)).toEqual({ '2026-10-24': [1, 0], '2026-10-25': [1, 1] });
		expect(counts(bucketRunsByDay(runs, NOW, zone('UTC')))).toEqual({ '2026-10-24': [2, 0], '2026-10-25': [0, 1] });
	});

	it('moves runs to the previous day in a zone behind UTC (America/Los_Angeles, PDT = UTC-7)', () => {
		const days = bucketRunsByDay(
			[
				run('2026-10-25T06:59:59.000Z'),
				run('2026-10-25T07:00:00.000Z'),
				run('2026-10-25T03:00:00.000Z', 'failed'),
			],
			NOW,
			zone('America/Los_Angeles')
		);
		expect(dates(days).at(-1)).toBe('2026-10-25');
		expect(counts(days)).toEqual({ '2026-10-24': [1, 1], '2026-10-25': [1, 0] });
	});

	it('keeps the 25-hour day of the autumn DST change as one day (Los Angeles, 2026-11-01)', () => {
		const now = Date.parse('2026-11-03T12:00:00.000Z');
		const days = bucketRunsByDay(
			[
				// 00:00 PDT and 23:59 PST of 1 November: the same day, 25 hours apart.
				run('2026-11-01T07:00:00.000Z'),
				run('2026-11-02T07:59:00.000Z'),
				run('2026-11-02T08:00:00.000Z', 'failed'),
			],
			now,
			zone('America/Los_Angeles')
		);
		expect(dates(days)).toEqual([
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
			'2026-11-01',
			'2026-11-02',
			'2026-11-03',
		]);
		expect(counts(days)).toEqual({ '2026-11-01': [2, 0], '2026-11-02': [0, 1] });
	});

	it('does not skip or repeat a day over the 23-hour day of the spring DST change (Los Angeles, 2026-03-08)', () => {
		const days = bucketRunsByDay([], Date.parse('2026-03-10T07:30:00.000Z'), zone('America/Los_Angeles'));
		expect(dates(days)).toEqual([
			'2026-03-04',
			'2026-03-05',
			'2026-03-06',
			'2026-03-07',
			'2026-03-08',
			'2026-03-09',
			'2026-03-10',
		]);
	});

	it('gives each day a noon instant that lies on that calendar day in the zone', () => {
		for (const zoneName of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kolkata']) {
			const formatter = zone(zoneName, 'en-CA');
			for (const day of bucketRunsByDay([], NOW, formatter)) {
				const local = formatter
					.intl({ dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' })
					.format(day.noon);
				expect(local, zoneName).toBe(`${day.date}, 12:00`);
			}
		}
	});

	it('ignores runs older than the seven days and runs after now', () => {
		const days = bucketRunsByDay(
			[run('2026-10-18T23:59:59.000Z'), run('2026-10-25T12:00:01.000Z'), run('2026-10-19T00:00:00.000Z')],
			NOW,
			zone('UTC')
		);
		expect(counts(days)).toEqual({ '2026-10-19': [1, 0] });
	});

	it.each(['ar-EG', 'th-TH', 'fa-IR'])(
		'does not depend on the digits or the calendar of the language (%s)',
		locale => {
			const days = bucketRunsByDay(
				[run('2026-10-25T06:59:00.000Z', 'failed')],
				NOW,
				zone('America/Los_Angeles', locale)
			);
			expect(dates(days).at(-1)).toBe('2026-10-25');
			expect(counts(days)).toEqual({ '2026-10-24': [0, 1] });
		}
	);
});
