import type { ExecutionState } from '../execution/ExecutionState.js';
import { requireTimestamp } from '../view/CellText.js';
import { summarizeFlows } from './FlowSummaries.js';
import { type HealthBanner, describeFlowHealth } from './HealthBanner.js';
import {
	type ActiveRunRow,
	type FailureRow,
	type FlowRow,
	type LatestRunRow,
	activeRuns,
	flowRows,
	latestRuns,
	recentFailures,
} from './RunRows.js';
import {
	type DailyRunCount,
	type SuccessTrend,
	type SuccessWindow,
	countRunsPerDay,
	countSince,
	successTrend,
	successWindow,
} from './RunTrend.js';
import { countByStatus } from './StatusCounts.js';

/** Finished runs the success window looks at. */
export const DIGEST_WINDOW = 20;
/** Days of the per-day history and of the success-rate comparison. */
export const DIGEST_DAYS = 7;
/** Rows of every list. */
export const DIGEST_ROWS = 5;
const DAY_MS = 86_400_000;

/** Everything a dashboard card can show about the runs, from one read of the executions. All times are ISO 8601. */
export interface RunDigest {
	total: number;
	running: number;
	failed: number;
	/** Start of the newest run; null before the first one. */
	lastRunAt: string | null;
	health: HealthBanner;
	/** Outcome of the last {@link DIGEST_WINDOW} finished runs. */
	window: SuccessWindow;
	/** Runs started in the last 24 hours. */
	last24h: { total: number; failed: number };
	/** One entry per day for the last {@link DIGEST_DAYS} days, oldest first. */
	daily: DailyRunCount[];
	/** Success rate of the last {@link DIGEST_DAYS} days against the {@link DIGEST_DAYS} before. */
	week: SuccessTrend;
	latest: LatestRunRow[];
	failures: FailureRow[];
	active: ActiveRunRow[];
	flows: FlowRow[];
}

/** `runs` newest first (as the execution loader returns them). */
export function buildRunDigest(runs: readonly ExecutionState[], now: number): RunDigest {
	const counts = countByStatus(runs);
	const flows = summarizeFlows(runs);
	const newest = runs[0];
	return {
		total: counts.total,
		running: counts.running,
		failed: counts.failed,
		lastRunAt: newest === undefined ? null : requireTimestamp(newest.startedAt),
		health: describeFlowHealth(flows),
		window: successWindow(runs, DIGEST_WINDOW),
		last24h: countSince(runs, now, DAY_MS),
		daily: countRunsPerDay(runs, now, DIGEST_DAYS),
		week: successTrend(runs, now, DIGEST_DAYS),
		latest: latestRuns(runs, DIGEST_ROWS),
		failures: recentFailures(runs, DIGEST_ROWS),
		active: activeRuns(runs, now, DIGEST_ROWS),
		flows: flowRows(flows, DIGEST_ROWS),
	};
}
