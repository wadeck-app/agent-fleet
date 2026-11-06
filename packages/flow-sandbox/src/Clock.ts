/** Source of time for components that wait (idle timers, ages). Injected so tests control it. */
export interface Clock {
	/** Milliseconds since the Unix epoch (ages are computed against timestamps reported by sbx). */
	now(): number;
}
