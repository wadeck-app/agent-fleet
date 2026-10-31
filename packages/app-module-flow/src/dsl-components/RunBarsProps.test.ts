import { describe, expect, it } from 'vitest';

import {
	RUN_BARS_KEYS,
	barHeights,
	barLink,
	parseRunBarsRuns,
	parseRunBarsTruncated,
	readRunBarsProps,
} from './RunBarsProps.js';

const RUN = { startedAt: '2026-10-23T22:00:00.000Z', status: 'completed' };

describe('readRunBarsProps', () => {
	it('resolves runs and truncated against the context', () => {
		expect(
			readRunBarsProps({ runs: '$ctx.recent', truncated: '$ctx.cut', to: '/p' }, { recent: [RUN], cut: false })
		).toEqual({ runs: [RUN], truncated: false, to: '/p', unexpectedKeys: [] });
	});

	it('lists the keys outside the contract, sorted, ignoring engine keys', () => {
		const props = readRunBarsProps({ $type: 'flow:RunBars', runs: [], height: 64, className: 'a' }, {});
		expect(props.unexpectedKeys).toEqual(['className', 'height']);
	});

	it('refuses the old days key: the data is now the runs', () => {
		expect(readRunBarsProps({ days: [] }, {}).unexpectedKeys).toEqual(['days']);
	});

	it('declares exactly runs, truncated and to', () => {
		expect([...RUN_BARS_KEYS]).toEqual(['runs', 'truncated', 'to']);
	});
});

describe('parseRunBarsRuns', () => {
	it('reads the start time as a date and keeps the status', () => {
		const [run] = parseRunBarsRuns([RUN]);
		expect(run!.startedAt.toISOString()).toBe('2026-10-23T22:00:00.000Z');
		expect(run!.status).toBe('completed');
	});

	it('accepts an empty list', () => {
		expect(parseRunBarsRuns([])).toEqual([]);
	});

	it('refuses anything but a list, saying what it got', () => {
		expect(() => parseRunBarsRuns(undefined)).toThrow(/runs must be a list.*got nothing/);
		expect(() => parseRunBarsRuns({})).toThrow(/runs must be a list/);
	});

	it('names the run and the field of a bad start time', () => {
		expect(() => parseRunBarsRuns([RUN, { ...RUN, startedAt: 'yesterday' }])).toThrow(/run 1 startedAt.*ISO 8601/);
		expect(() => parseRunBarsRuns([{ ...RUN, startedAt: 5 }])).toThrow(/run 0 startedAt/);
	});

	it.each(['running', 'ok', undefined, 3])('names the run of a bad status %j', status => {
		expect(() => parseRunBarsRuns([{ ...RUN, status }])).toThrow(/run 0 status.*"completed" or "failed"/);
	});
});

describe('parseRunBarsTruncated', () => {
	it('reads a boolean', () => {
		expect(parseRunBarsTruncated(true)).toBe(true);
		expect(parseRunBarsTruncated(false)).toBe(false);
	});

	it.each([undefined, 'true', 1, null])('refuses %j instead of guessing', value => {
		expect(() => parseRunBarsTruncated(value)).toThrow(/truncated must be true or false/);
	});
});

describe('barHeights', () => {
	it('scales both bars of every day on the busiest bar of the week', () => {
		expect(
			barHeights([
				{ completed: 20, failed: 12 },
				{ completed: 10, failed: 0 },
			])
		).toEqual([
			{ completed: 100, failed: 60 },
			{ completed: 50, failed: 0 },
		]);
	});

	it('is all zero for a week without run (no division by zero)', () => {
		expect(barHeights([{ completed: 0, failed: 0 }])).toEqual([{ completed: 0, failed: 0 }]);
	});

	it('keeps a bar of 1 run visible next to a bar of 1000 (never under 8 percent)', () => {
		expect(barHeights([{ completed: 1000, failed: 1 }])[0]!.failed).toBe(8);
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
