import { buildRunDigest } from 'flow-core';
import { makeExec } from 'flow-core/testing';
import { describe, expect, it } from 'vitest';

import { toWidgetBody } from './ExecutionWidgetBody.js';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const body = (...runs: Parameters<typeof makeExec>[0][]) =>
	toWidgetBody(
		buildRunDigest(
			runs.map(run => makeExec(run)),
			NOW
		)
	);

describe('toWidgetBody', () => {
	it('answers zeros, an empty-state sentence and no shortcut when nothing ran', () => {
		expect(body()).toMatchObject({
			total: 0,
			running: 0,
			failed: 0,
			viewAllLabel: 'View all executions',
			lastRun: [],
			healthText: 'No execution yet',
			healthVariant: 'default',
			rateValue: 0,
			rateMax: 1,
			rateLabel: 'No finished run',
			rateVariant: 'default',
			failures24h: 0,
			runs24hLabel: 'No run in 24h',
			weekRateValue: 'No data',
			weekTrend: null,
			latest: [],
			failures: [],
			active: [],
			flows: [],
			hasLatestFailure: false,
			hasNoLatestFailure: true,
		});
	});

	it('sends the summary: counts, link label, health sentence and last run start', () => {
		const result = body(
			{ executionId: 'bad', status: 'failed', lastError: 'boom', startedAt: '2026-10-22T11:00:00.000Z' },
			{ executionId: 'ok', startedAt: '2026-10-22T10:00:00.000Z' }
		);
		expect(result).toMatchObject({
			total: 2,
			failed: 1,
			viewAllLabel: 'View all 2 executions',
			lastRun: [{ startedAt: '2026-10-22T11:00:00.000Z' }],
			lastRunAt: '2026-10-22T11:00:00.000Z',
			healthText: '1 flow failing',
			healthVariant: 'danger',
			failures24h: 1,
			runs24hLabel: 'of 2 runs in 24h',
		});
	});

	it('turns the success window into Progress props: ok count over finished runs, coloured by the rate', () => {
		const runs = (ok: number, failed: number) => [
			...Array.from({ length: failed }, (_, i) => ({ executionId: `f${i}`, status: 'failed' as const })),
			...Array.from({ length: ok }, (_, i) => ({ executionId: `o${i}` })),
		];
		expect(body(...runs(19, 1))).toMatchObject({
			rateValue: 19,
			rateMax: 20,
			rateLabel: '19 of 20 ok',
			rateVariant: 'success',
		});
		expect(body(...runs(7, 3))).toMatchObject({ rateValue: 7, rateMax: 10, rateVariant: 'default' });
		expect(body(...runs(1, 3))).toMatchObject({ rateValue: 1, rateMax: 4, rateVariant: 'danger' });
	});

	it('compares the week success rate with the week before: points of difference, arrow direction', () => {
		const week = (daysAgo: number, id: string, status: 'completed' | 'failed') => ({
			executionId: id,
			status,
			startedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
		});
		expect(body(week(1, 'a', 'completed'), week(9, 'b', 'completed'), week(10, 'c', 'failed'))).toMatchObject({
			weekRateValue: '100%',
			weekTrend: { value: 50, direction: 'up', label: 'vs previous 7 days' },
		});
		expect(body(week(1, 'a', 'failed'), week(9, 'b', 'completed'))).toMatchObject({
			weekRateValue: '0%',
			weekTrend: { value: 100, direction: 'down' },
		});
		expect(body(week(1, 'a', 'completed'), week(9, 'b', 'completed'))).toMatchObject({
			weekTrend: { value: 0, direction: 'neutral' },
		});
		// No run the week before: nothing to compare with, so no arrow.
		expect(body(week(1, 'a', 'completed'))).toMatchObject({ weekRateValue: '100%', weekTrend: null });
	});

	it('sends the per-day history for the chart: ISO day starts and counts', () => {
		const { daily } = body({ executionId: 'a', startedAt: '2026-10-22T11:00:00.000Z' }) as unknown as {
			daily: { dayStart: string; completed: number }[];
		};
		expect(daily).toHaveLength(7);
		expect(daily.at(-1)).toMatchObject({ completed: 1 });
		expect(daily.every(day => !Number.isNaN(Date.parse(day.dayStart)))).toBe(true);
	});

	it('shortcuts to the chart of the newest failed run, when there is one', () => {
		expect(
			body(
				{ executionId: 'new bad', status: 'failed', lastError: 'x', startedAt: '2026-10-22T10:00:00.000Z' },
				{ executionId: 'old', status: 'failed', lastError: 'x', startedAt: '2026-10-21T10:00:00.000Z' }
			)
		).toMatchObject({
			hasLatestFailure: true,
			hasNoLatestFailure: false,
			latestFailureAt: '2026-10-22T10:00:00.000Z',
			latestFailureChartPath: '/modules/flow-chart/flows/runs/new%20bad',
		});
	});
});
