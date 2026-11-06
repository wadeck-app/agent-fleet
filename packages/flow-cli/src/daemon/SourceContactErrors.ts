import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** What `contactDeclaredSources` tells about each ask of a source. It never carries the text of an error. */
export interface ContactOutcome {
	failed(sourceId: string): void;
	succeeded(sourceId: string): void;
}

interface ContactFailureRun {
	/** When the latest failure happened. */
	at: number;
	/** When the first failure of the current run of failures happened. */
	firstAt: number;
	consecutiveFailures: number;
}

/**
 * That asking a source for a worker failed, when, and how many times in a row: METADATA ONLY.
 *
 * The text of a contact error is third-party text (a plugin's, a wrapper's): it can hold a credential in any shape, and no
 * filter can make arbitrary text safe to put in a step failure, a log line, the UI or a queue event. So it is never stored
 * here and never reaches a message; it goes to the daemon log, where it always went, and the message points there.
 *
 * One entry per source, dropped by the next successful ask. Two asks of the same source in flight at once count as one
 * run in the order they FINISH. A wrapper that dies AFTER the ask returned is not a contact failure and is not seen here.
 */
export class SourceContactErrors implements ContactOutcome {
	private readonly runs = new Map<string, ContactFailureRun>();

	/**
	 * @param logsDir Where the daemon log files are, named in the message; without it the message says only `flow logs`.
	 */
	constructor(
		private readonly logsDir?: string,
		private readonly now: () => number = Date.now
	) {}

	failed(sourceId: string): void {
		const at = this.now();
		const previous = this.runs.get(sourceId);
		this.runs.set(sourceId, {
			at,
			firstAt: previous?.firstAt ?? at,
			consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
		});
	}

	succeeded(sourceId: string): void {
		this.runs.delete(sourceId);
	}

	/** Forgets the sources that are no longer declared, so a removed source's failures do not stay for the daemon's life. */
	retainOnly(declared: Iterable<string>): void {
		const keep = new Set(declared);
		for (const sourceId of [...this.runs.keys()]) {
			if (!keep.has(sourceId)) {
				this.runs.delete(sourceId);
			}
		}
	}

	/** {@link since} for one type, as the function a bound-step wait asks with the time it started. */
	sinceFor(type: string, typeOf: WorkerTypeLookup): (sinceMs: number) => string[] {
		return sinceMs => this.since(type, typeOf, sinceMs);
	}

	/** One sentence per source of `type` whose latest failure is NOT older than `sinceMs`. */
	since(type: string, typeOf: WorkerTypeLookup, sinceMs: number): string[] {
		const sentences: string[] = [];
		for (const [sourceId, run] of this.runs) {
			if (typeOf(sourceId) === type && run.at >= sinceMs) {
				sentences.push(this.describe(sourceId, run));
			}
		}
		return sentences;
	}

	private describe(sourceId: string, run: ContactFailureRun): string {
		const streak =
			run.consecutiveFailures > 1
				? ` (${String(run.consecutiveFailures)} consecutive failures since ${clockOf(run.firstAt)})`
				: '';
		const where = this.logsDir === undefined ? 'flow logs' : `flow logs, or ${this.logsDir}`;
		return `Last contact with source "${sourceId}" failed at ${isoOf(run.at)}${streak}; the error is in the daemon log (${where}).`;
	}
}

/** `2026-11-06T17:02:11Z`: seconds are enough to find the line in the log. */
function isoOf(ms: number): string {
	return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** `17:01:20Z` */
function clockOf(ms: number): string {
	return isoOf(ms).slice(11);
}
