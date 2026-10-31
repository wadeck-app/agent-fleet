import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

/** Longest delay between two retries, and the least time between two stderr lines about the failures. */
export const MAX_RETRY_MS = 30_000;

/**
 * What a timer that re-runs a dispatch pass does when the pass throws: how long to wait before the next attempt, and
 * what to tell the user, so a permanent error costs one attempt and one stderr line every {@link MAX_RETRY_MS}, not one
 * of each per tick.
 *
 * The delay doubles with each failure in a row, from `firstRetryMs` up to {@link MAX_RETRY_MS}, and starts over when a
 * pass goes through ({@link succeeded}). The report is throttled to one line per {@link MAX_RETRY_MS}; the failures
 * left out are counted in the next line, so nothing is swallowed silently. One instance serves every timer that
 * re-runs the same pass: a pass fails for all of them, not for one.
 */
export class RetryBackoff {
	private failuresInARow = 0;
	private lastReportAt: number | undefined;
	private notShown = 0;

	/**
	 * @param prefix Start of every stderr line, e.g. `[BoundStepWait]`.
	 * @param firstRetryMs Delay after the first failure of a series.
	 */
	constructor(
		private readonly prefix: string,
		private readonly firstRetryMs: number,
		private readonly now: () => number = Date.now
	) {}

	/** A pass went through: the next failure waits `firstRetryMs` again. */
	succeeded(): void {
		this.failuresInARow = 0;
	}

	/**
	 * Records a failed pass and writes it to stderr unless a line was written less than {@link MAX_RETRY_MS} ago.
	 *
	 * @param what The pass that failed, as the start of a sentence, e.g. `dispatch pass of the demand re-check`.
	 * @returns How long to wait before trying again.
	 */
	failed(what: string, err: unknown): number {
		this.failuresInARow++;
		const retryMs = Math.min(this.firstRetryMs * 2 ** (this.failuresInARow - 1), MAX_RETRY_MS);
		const now = this.now();
		if (this.lastReportAt !== undefined && now - this.lastReportAt < MAX_RETRY_MS) {
			this.notShown++;
			return retryMs;
		}
		const omitted =
			this.notShown === 0 ? '' : ` (${String(this.notShown)} similar failure(s) since the last line not shown)`;
		process.stderr.write(
			`${this.prefix} ${what} failed (${String(this.failuresInARow)} in a row), asking again in ${String(retryMs / 1000)}s: ${getErrorMessage(err)}${omitted}\n`
		);
		this.lastReportAt = now;
		this.notShown = 0;
		return retryMs;
	}
}
