import type { ExecutionState } from '../execution/ExecutionState.js';
import { type LatestRunRow, latestRuns } from './RunRows.js';
import { type DailyRunCount, countRunsPerDay } from './RunTrend.js';
import { countByStatus } from './StatusCounts.js';

/** Days of the per-day history. */
export const DIGEST_DAYS = 7;
/** Rows of the latest-runs list. */
export const DIGEST_ROWS = 5;

/** What the dashboard card shows about the runs, from one read of the executions. All times are ISO 8601. */
export interface RunDigest {
	total: number;
	running: number;
	failed: number;
	/** One entry per day for the last {@link DIGEST_DAYS} days, oldest first. */
	daily: DailyRunCount[];
	latest: LatestRunRow[];
}

/** `runs` newest first (as the execution loader returns them). */
export function buildRunDigest(runs: readonly ExecutionState[], now: number): RunDigest {
	const counts = countByStatus(runs);
	return {
		total: counts.total,
		running: counts.running,
		failed: counts.failed,
		daily: countRunsPerDay(runs, now, DIGEST_DAYS),
		latest: latestRuns(runs, DIGEST_ROWS),
	};
}
