import type { CancelScheduled, Scheduler } from './Scheduler';

/** Largest delay `setTimeout` honours; a longer one fires immediately, which would be a silent bug. */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/** The real timers. The handle is unref'd: a pending idle timer never keeps the wrapper process alive. */
export class SystemScheduler implements Scheduler {
	schedule(delayMs: number, callback: () => void): CancelScheduled {
		if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_TIMER_DELAY_MS) {
			throw new RangeError(
				`SystemScheduler needs a delay between 0 and ${MAX_TIMER_DELAY_MS} ms, got ${delayMs}`
			);
		}
		const handle = setTimeout(callback, delayMs);
		handle.unref();
		return () => clearTimeout(handle);
	}
}
