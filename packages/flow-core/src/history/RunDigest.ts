import type { ExecutionState } from '../execution/ExecutionState.js';
import { type RecentRun, selectRecentRuns } from './RecentRuns.js';
import { type LatestRunRow, latestRuns } from './RunRows.js';
import { countByStatus } from './StatusCounts.js';

/** Rows of the latest-runs list. */
export const DIGEST_ROWS = 5;

/** What the dashboard card shows about the runs, from one read of the executions. All times are ISO 8601. */
export interface RunDigest {
	total: number;
	running: number;
	failed: number;
	/** Finished runs of the last days, newest first: the view buckets them per day in the viewer's time zone. */
	recentRuns: RecentRun[];
	/** True when {@link recentRuns} holds only the newest runs of the window (cap reached). */
	recentRunsTruncated: boolean;
	latest: LatestRunRow[];
}

/** `runs` newest first (as the execution loader returns them). */
export function buildRunDigest(runs: readonly ExecutionState[], now: number): RunDigest {
	const counts = countByStatus(runs);
	const recent = selectRecentRuns(runs, now);
	return {
		total: counts.total,
		running: counts.running,
		failed: counts.failed,
		recentRuns: recent.runs,
		recentRunsTruncated: recent.truncated,
		latest: latestRuns(runs, DIGEST_ROWS),
	};
}
