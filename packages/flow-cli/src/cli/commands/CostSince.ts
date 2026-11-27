import { IsoDateOption } from './IsoDateOption';

/** The `--since` value of `flow cost`: an ISO date (UTC midnight) or datetime (UTC when it has no offset). */
export class CostSince {
	/** @throws InvalidQueryError naming the value and an example. */
	static parse(value: string): number {
		return IsoDateOption.parse(value, '--since');
	}

	/** True when the run started at or after `sinceMs`. An unreadable start time never matches (the run is left out, not guessed). */
	static includes(startedAt: string, sinceMs: number): boolean {
		const started = Date.parse(startedAt);
		return !Number.isNaN(started) && started >= sinceMs;
	}
}
