import type { ExecutionState } from '../execution/ExecutionState.js';

/** Runs finished one way or the other: the only ones a success rate can speak about. */
function isFinished(run: ExecutionState): boolean {
	return run.status === 'completed' || run.status === 'failed';
}

function startedMs(run: ExecutionState): number {
	return new Date(run.startedAt).getTime();
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
	}));
}
