import { DIGEST_DAYS, type RunDigest, chartPathOfExecution } from 'flow-core';

/** Success rate (percent) from which the bar of the `rate` summary turns green. */
export const GOOD_SUCCESS_RATE = 90;
/** Success rate (percent) below which it turns red; in between it keeps the neutral colour. */
export const BAD_SUCCESS_RATE = 60;

type ProgressVariant = 'default' | 'success' | 'danger';
type TrendDirection = 'up' | 'down' | 'neutral';

function rateVariant(rate: number | null): ProgressVariant {
	if (rate === null) {
		return 'default';
	}
	if (rate >= GOOD_SUCCESS_RATE) {
		return 'success';
	}
	return rate < BAD_SUCCESS_RATE ? 'danger' : 'default';
}

function trendOf(current: number | null, previous: number | null) {
	// Without a finished run in one of the two weeks there is nothing to compare: no arrow rather than a made-up one.
	if (current === null || previous === null) {
		return null;
	}
	const delta = current - previous;
	const direction: TrendDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
	return { value: Math.abs(delta), direction, label: `vs previous ${DIGEST_DAYS} days` };
}

/**
 * Body of `GET /widgets/executions`: the {@link RunDigest} flattened into the fields the dashboard widget views read
 * (`$sources.recent.<field>`). Times stay ISO 8601: the shell formats them. Which views read which field is in README.
 */
export function toWidgetBody(digest: RunDigest) {
	const { window, last24h, week } = digest;
	const finished = window.completed + window.failed;
	const latestFailure = digest.failures[0];
	return {
		total: digest.total,
		running: digest.running,
		failed: digest.failed,
		viewAllLabel: digest.total === 0 ? 'View all executions' : `View all ${digest.total} executions`,
		// One row (none before the first run): a tile cannot format a timestamp, a table column can.
		lastRun: digest.lastRunAt === null ? [] : [{ startedAt: digest.lastRunAt }],
		lastRunAt: digest.lastRunAt,

		healthText: digest.health.text,
		healthVariant: digest.health.variant,

		// Progress props: ok runs over the finished ones of the window (max 1 while there is none, 0 of 0 is not a bar).
		rateValue: window.completed,
		rateMax: Math.max(finished, 1),
		rateLabel: finished === 0 ? 'No finished run' : `${window.completed} of ${finished} ok`,
		rateVariant: rateVariant(window.successRate),

		failures24h: last24h.failed,
		runs24hLabel:
			last24h.total === 0
				? 'No run in 24h'
				: `of ${last24h.total} ${last24h.total === 1 ? 'run' : 'runs'} in 24h`,

		daily: digest.daily,
		weekRateValue: week.current === null ? 'No data' : `${week.current}%`,
		weekTrend: trendOf(week.current, week.previous),

		latest: digest.latest,
		failures: digest.failures,
		active: digest.active,
		flows: digest.flows,

		// Booleans for `$if`: a view hides a node on a falsy value but cannot test for an empty list or a null.
		hasLatestFailure: latestFailure !== undefined,
		hasNoLatestFailure: latestFailure === undefined,
		latestFailureAt: latestFailure?.startedAt ?? null,
		latestFailureChartPath: latestFailure === undefined ? null : chartPathOfExecution(latestFailure.executionId),
	};
}
