/** The part of the scheduler this needs. */
export interface RetryCounter {
	getRetryCount(stepId: string): number;
}

/**
 * Tells, when a step starts again, whether the scheduler re-ran it as a `retry` or for any other reason (`loop`: an
 * `onFailure.goto` loop or a sub-step round restart).
 *
 * The scheduler only keeps a running count of the retries it granted, so a retry is a start at which that count has grown
 * since the step last started. Kept per scheduler instance, so it disappears with the execution.
 */
export class ReRunKindTracker {
	private readonly seen = new WeakMap<RetryCounter, Map<string, number>>();

	/** Call once per start of `stepId`; the answer only matters for a start after the first. */
	kindFor(scheduler: RetryCounter | undefined, stepId: string): 'retry' | 'loop' {
		if (scheduler === undefined) {
			return 'loop';
		}
		let counts = this.seen.get(scheduler);
		if (counts === undefined) {
			counts = new Map();
			this.seen.set(scheduler, counts);
		}
		const current = scheduler.getRetryCount(stepId);
		const previous = counts.get(stepId) ?? 0;
		counts.set(stepId, current);
		return current > previous ? 'retry' : 'loop';
	}
}
