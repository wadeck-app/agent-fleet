import { InvalidQueryError } from 'flow-core';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** The `--since` value of `flow cost`: an ISO date (UTC midnight) or datetime (UTC when it has no offset). */
export class CostSince {
	/** @throws InvalidQueryError naming the value and an example. */
	static parse(value: string): number {
		const fail = (): never => {
			throw new InvalidQueryError(
				`Invalid --since "${value}": expected an ISO date or datetime, e.g. --since 2026-11-01 or --since 2026-11-01T08:30:00Z.`
			);
		};
		const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(value);
		if (!DATE_ONLY.test(value) && !DATE_TIME.test(value)) {
			return fail();
		}
		const time = Date.parse(DATE_ONLY.test(value) || hasOffset ? value : `${value}Z`);
		if (Number.isNaN(time)) {
			return fail();
		}
		// Date silently rolls 2026-02-31 over to March: refuse it instead.
		if (DATE_ONLY.test(value) && new Date(time).toISOString().slice(0, 10) !== value) {
			return fail();
		}
		return time;
	}

	/** True when the run started at or after `sinceMs`. An unreadable start time never matches (the run is left out, not guessed). */
	static includes(startedAt: string, sinceMs: number): boolean {
		const started = Date.parse(startedAt);
		return !Number.isNaN(started) && started >= sinceMs;
	}
}
