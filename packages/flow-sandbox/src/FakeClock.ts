import type { Clock } from './Clock';

/** A clock that moves only when told to. */
export class FakeClock implements Clock {
	private current: number;

	constructor(start = 0) {
		this.current = start;
	}

	now(): number {
		return this.current;
	}

	advance(milliseconds: number): void {
		if (!Number.isFinite(milliseconds) || milliseconds < 0) {
			throw new Error(`FakeClock.advance needs a non-negative number of milliseconds, got ${milliseconds}`);
		}
		this.current += milliseconds;
	}
}
