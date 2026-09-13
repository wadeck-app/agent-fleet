/**
 * Notices a step that stopped making noise.
 *
 * The gap this closes: a worker's socket closing was the *only* thing the daemon reacted to, so a
 * step that simply never finished held its assignment forever and the flow waited with it. A `jest`
 * run left in a workspace was still holding one 32 hours later.
 *
 * Silence is the signal, not a socket ping: a worker whose step is wedged has a perfectly responsive
 * event loop, so pings answer normally. Any traffic for the assignment counts as progress, so a long
 * step that keeps printing is never killed for being slow -- only one that says nothing at all.
 */
export class StalledStepWatch {
	private readonly lastActivity = new Map<string, number>();

	/**
	 * @param limitMs silence after which an assignment is considered stalled
	 * @param now injectable clock, so the sweep is testable without waiting
	 */
	constructor(
		private readonly limitMs: number,
		private readonly now: () => number = Date.now
	) {
		if (!Number.isFinite(limitMs) || limitMs <= 0) {
			throw new Error(
				`StalledStepWatch needs a positive silence limit in milliseconds, got ${String(limitMs)}. Zero or less would fail every step the moment it was dispatched.`
			);
		}
	}

	/** Begins watching an assignment the worker has started executing. */
	started(assignmentId: string): void {
		this.lastActivity.set(assignmentId, this.now());
	}

	/** Records traffic for an assignment. Unknown ids are ignored: nothing is being watched. */
	progressed(assignmentId: string): void {
		if (!this.lastActivity.has(assignmentId)) return;
		this.lastActivity.set(assignmentId, this.now());
	}

	/** Stops watching a settled assignment. */
	settled(assignmentId: string): void {
		this.lastActivity.delete(assignmentId);
	}

	/**
	 * Assignments silent past the limit, dropped from the watch as they are returned.
	 *
	 * Reported once on purpose: the caller fails the step, and a second report would fail it again
	 * on the next sweep.
	 */
	stalled(): string[] {
		const deadline = this.now() - this.limitMs;
		const found: string[] = [];
		for (const [assignmentId, at] of this.lastActivity) {
			if (at <= deadline) found.push(assignmentId);
		}
		for (const assignmentId of found) this.lastActivity.delete(assignmentId);
		return found;
	}
}
