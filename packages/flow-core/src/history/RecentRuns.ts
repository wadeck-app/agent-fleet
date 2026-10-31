import type { ExecutionState } from '../execution/ExecutionState.js';

/**
 * Days of runs sent for the per-day bars. The bars show 7 days, bucketed by the viewer's time zone, which the server does
 * not know: 8 days of margin cover the 7 calendar days of any zone (UTC-12 to UTC+14) around "now".
 */
export const RECENT_RUNS_DAYS = 8;
/** At most this many runs are sent (about 60 bytes each), the newest ones; `truncated` tells the view the oldest days may be short. */
export const RECENT_RUNS_CAP = 2000;

/** A finished run reduced to what the per-day bars count: when it started and how it ended. */
export interface RecentRun {
	/** ISO 8601: the viewer's shell picks the calendar day, in the viewer's time zone. */
	startedAt: string;
	status: 'completed' | 'failed';
}

export interface RecentRuns {
	/** Newest first. */
	runs: RecentRun[];
	/** True when more than the cap were in the window: only the newest are listed. */
	truncated: boolean;
}

/** The finished runs of the last {@link RECENT_RUNS_DAYS} days (`runs` newest first, as the execution loader returns them), at most `cap`. */
export function selectRecentRuns(
	runs: readonly ExecutionState[],
	now: number,
	cap: number = RECENT_RUNS_CAP
): RecentRuns {
	if (!Number.isInteger(cap) || cap < 1) {
		throw new Error(`cap must be a positive integer, got ${String(cap)}.`);
	}
	const windowStart = now - RECENT_RUNS_DAYS * 24 * 3600 * 1000;
	const selected: RecentRun[] = [];
	let truncated = false;
	for (const run of runs) {
		if (run.status !== 'completed' && run.status !== 'failed') {
			continue;
		}
		const started = new Date(run.startedAt).getTime();
		if (Number.isNaN(started)) {
			throw new Error(
				`Cannot count the run ${run.executionId}: its start time '${run.startedAt}' is not a valid date (corrupt execution file?).`
			);
		}
		if (started > now || started < windowStart) {
			continue;
		}
		if (selected.length === cap) {
			truncated = true;
			break;
		}
		selected.push({ startedAt: run.startedAt, status: run.status });
	}
	return { runs: selected, truncated };
}
