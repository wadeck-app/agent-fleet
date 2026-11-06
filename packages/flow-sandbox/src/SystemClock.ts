import type { Clock } from './Clock';

/** The wall clock. */
export class SystemClock implements Clock {
	now(): number {
		return Date.now();
	}
}
