import { describe, expect, it } from 'vitest';

import { RUN_BARS_KEYS, barHeights, barLink, parseRunBarsDays, readRunBarsProps } from './RunBarsProps.js';

const DAY = { dayStart: '2026-10-23T22:00:00.000Z', completed: 20, failed: 12 };

describe('readRunBarsProps', () => {
	it('resolves days against the context', () => {
		expect(readRunBarsProps({ days: '$ctx.daily', to: '/p' }, { daily: [DAY] })).toEqual({
			days: [DAY],
			to: '/p',
			unexpectedKeys: [],
		});
	});

	it('lists the keys outside the contract, sorted, ignoring engine keys', () => {
		const props = readRunBarsProps({ $type: 'flow:RunBars', days: [], height: 64, className: 'a' }, {});
		expect(props.unexpectedKeys).toEqual(['className', 'height']);
	});

	it('declares exactly days and to', () => {
		expect([...RUN_BARS_KEYS]).toEqual(['days', 'to']);
	});
});

describe('parseRunBarsDays', () => {
	it('returns the days with their start as a Date', () => {
		const [day] = parseRunBarsDays([DAY]);
		expect(day).toMatchObject({ completed: 20, failed: 12 });
		expect(day!.dayStart.toISOString()).toBe('2026-10-23T22:00:00.000Z');
	});

	it('refuses a value that is not a list, saying what it got', () => {
		expect(() => parseRunBarsDays(undefined)).toThrow(/days must be a list.*got nothing/);
		expect(() => parseRunBarsDays({})).toThrow(/days must be a list/);
	});

	it('refuses a day with a bad start, naming the day', () => {
		expect(() => parseRunBarsDays([DAY, { ...DAY, dayStart: 'yesterday' }])).toThrow(/day 1 dayStart.*ISO 8601/);
		expect(() => parseRunBarsDays([{ ...DAY, dayStart: 5 }])).toThrow(/day 0 dayStart/);
	});

	it.each(['completed', 'failed'])('refuses a %s that is not a count', field => {
		expect(() => parseRunBarsDays([{ ...DAY, [field]: -1 }])).toThrow(new RegExp(`day 0 ${field}`));
		expect(() => parseRunBarsDays([{ ...DAY, [field]: 1.5 }])).toThrow(new RegExp(`day 0 ${field}`));
		expect(() => parseRunBarsDays([{ ...DAY, [field]: '3' }])).toThrow(new RegExp(`day 0 ${field}`));
	});
});

describe('barHeights', () => {
	it('scales both bars of every day on the busiest bar of the week', () => {
		const days = parseRunBarsDays([DAY, { ...DAY, completed: 10, failed: 0 }]);
		expect(barHeights(days)).toEqual([
			{ completed: 100, failed: 60 },
			{ completed: 50, failed: 0 },
		]);
	});

	it('is all zero for a week without run (no division by zero)', () => {
		expect(barHeights(parseRunBarsDays([{ ...DAY, completed: 0, failed: 0 }]))).toEqual([
			{ completed: 0, failed: 0 },
		]);
	});

	it('keeps a bar of 1 run visible next to a bar of 1000 (never under 8 percent)', () => {
		const days = parseRunBarsDays([{ ...DAY, completed: 1000, failed: 1 }]);
		expect(barHeights(days)[0]!.failed).toBe(8);
	});
});

describe('barLink', () => {
	it('opens the executions page filtered on the status the bar stands for', () => {
		expect(barLink('/modules/flow/executions', 'failed')).toBe('/modules/flow/executions?status=failed');
		expect(barLink('/modules/flow/executions', 'completed')).toBe('/modules/flow/executions?status=completed');
	});

	it.each([
		'executions',
		'https://example.com/x',
		'//evil.example',
		'/modules/flow/executions?status=failed',
		'/a#b',
	])('refuses the page %j, saying what to write', to => {
		expect(() => barLink(to, 'failed')).toThrow(/flow:RunBars to must be an app path/);
	});
});
