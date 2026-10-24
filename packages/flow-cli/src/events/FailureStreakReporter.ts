/** What the queue SDK hands to `onError` (structurally its `QueueFailure`). */
export interface PublishFailure {
	kind: string;
	message: string;
	event: string;
	outcome: 'dropped' | 'unknown';
	/** `register-events` for an event declaration; absent or `publish` for a push. */
	operation?: string;
}

/**
 * Turns the SDK's failures into daemon-log lines, once per streak.
 *
 * A stopped or missing queue fails every event of every run; one line per event would bury the
 * log. The same kind of failure is logged once, then again after `quietMs` with the number of
 * failures it covered. A different kind is always logged at once.
 */
export class FailureStreakReporter {
	private lastKind: string | undefined;
	private lastLoggedAt = 0;
	private suppressed = 0;

	constructor(
		private readonly log: (line: string) => void,
		private readonly now: () => number = Date.now,
		private readonly quietMs: number = 10 * 60_000
	) {}

	report(failure: PublishFailure): void {
		const sameStreak = failure.kind === this.lastKind && this.now() - this.lastLoggedAt < this.quietMs;
		if (sameStreak) {
			this.suppressed += 1;
			return;
		}
		const covered =
			this.suppressed > 0 ? ` (${String(this.suppressed)} similar failure(s) since the last report)` : '';
		this.log(
			`Queue events: ${failure.kind} while publishing ${failure.event} (${failure.outcome}): ${failure.message}${covered}`
		);
		this.lastKind = failure.kind;
		this.lastLoggedAt = this.now();
		this.suppressed = 0;
	}
}
