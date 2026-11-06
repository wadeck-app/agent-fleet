/** Cancels a scheduled callback; calling it twice or after the callback ran is harmless. */
export type CancelScheduled = () => void;

/** Runs a callback once after a delay. Injected so tests move time by hand instead of waiting. */
export interface Scheduler {
	schedule(delayMs: number, callback: () => void): CancelScheduled;
}
