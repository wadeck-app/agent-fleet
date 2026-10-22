import type { ExecutionState } from '../execution/ExecutionState.js';

/** Runs finished one way or the other: the only ones a success rate can speak about. */
function isFinished(run: ExecutionState): boolean {
	return run.status === 'completed' || run.status === 'failed';
}

function startedMs(run: ExecutionState): number {
	return new Date(run.startedAt).getTime();
}

/** Whole percent of completed runs among finished ones, or null when none finished (0% would be a lie). */
function ratePercent(completed: number, failed: number): number | null {
	const finished = completed + failed;
	return finished === 0 ? null : Math.round((completed / finished) * 100);
}

function assertPositiveInteger(name: string, value: number): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer, got ${String(value)}.`);
	}
}

/** Finished runs of one calendar day (the host's local day: the viewer of a local dashboard shares it). */
export interface DailyRunCount {
	/** ISO 8601 instant of the local midnight that starts the day: the shell formats it. */
	dayStart: string;
	completed: number;
	failed: number;
	/** Whole percent, null when nothing finished that day. */
	successRate: number | null;
}

/** One entry per local day, oldest first, the last one being the day of `now`; days without a run are zero-filled. */
export function countRunsPerDay(runs: readonly ExecutionState[], now: number, days: number): DailyRunCount[] {
	assertPositiveInteger('days', days);
	const today = new Date(now);
	const counts = Array.from({ length: days }, (_, index) => {
		const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - index));
		return { start: start.getTime(), completed: 0, failed: 0 };
	});
	for (const run of runs) {
		const started = startedMs(run);
		if (!isFinished(run) || started > now) {
			continue;
		}
		// Last day whose start is not after the run: a run before the first day matches none.
		const day = [...counts].reverse().find(candidate => candidate.start <= started);
		if (day === undefined) {
			continue;
		}
		if (run.status === 'completed') {
			day.completed += 1;
		} else {
			day.failed += 1;
		}
	}
	return counts.map(({ start, completed, failed }) => ({
		dayStart: new Date(start).toISOString(),
		completed,
		failed,
		successRate: ratePercent(completed, failed),
	}));
}

export interface SuccessWindow {
	completed: number;
	failed: number;
	/** Whole percent, null when no run is finished. */
	successRate: number | null;
}

/** Outcome of the `size` newest finished runs (`runs` are newest first, as the loader returns them). */
export function successWindow(runs: readonly ExecutionState[], size: number): SuccessWindow {
	assertPositiveInteger('size', size);
	const window = runs.filter(isFinished).slice(0, size);
	const failed = window.filter(run => run.status === 'failed').length;
	const completed = window.length - failed;
	return { completed, failed, successRate: ratePercent(completed, failed) };
}

export interface SuccessTrend {
	current: number | null;
	previous: number | null;
}

/** Success rate of the last `days` x 24h against the same length just before it (rolling windows ending at `now`). */
export function successTrend(runs: readonly ExecutionState[], now: number, days: number): SuccessTrend {
	assertPositiveInteger('days', days);
	const periodMs = days * 86_400_000;
	const rateBetween = (from: number, to: number): number | null => {
		const inPeriod = runs.filter(run => isFinished(run) && startedMs(run) > from && startedMs(run) <= to);
		const failed = inPeriod.filter(run => run.status === 'failed').length;
		return ratePercent(inPeriod.length - failed, failed);
	};
	return {
		current: rateBetween(now - periodMs, now),
		previous: rateBetween(now - 2 * periodMs, now - periodMs),
	};
}

/** Runs started in the last `windowMs`, whatever their status, and how many of them failed. */
export function countSince(
	runs: readonly ExecutionState[],
	now: number,
	windowMs: number
): { total: number; failed: number } {
	const recent = runs.filter(run => startedMs(run) > now - windowMs && startedMs(run) <= now);
	return { total: recent.length, failed: recent.filter(run => run.status === 'failed').length };
}
