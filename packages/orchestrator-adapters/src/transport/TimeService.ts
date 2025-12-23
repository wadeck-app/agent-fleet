/**
 * ===========================================================================================
 * TIME SERVICE
 * ===========================================================================================
 *
 * Abstraction for time-based operations (setTimeout, setInterval, clearTimeout, clearInterval).
 * Allows for controllable timing in tests without relying on fake timers.
 *
 * Usage:
 * - Production: Use RealTimeService (default)
 * - Tests: Use ControllableTimeService for deterministic timing
 *
 * ===========================================================================================
 */

export interface TimeService {
	setTimeout(fn: () => void, delay: number): NodeJS.Timeout;
	clearTimeout(id: NodeJS.Timeout): void;
	setInterval(fn: () => void, delay: number): NodeJS.Timeout;
	clearInterval(id: NodeJS.Timeout): void;
}

/**
 * Real time service for production use
 * Delegates to native setTimeout/setInterval/clearTimeout/clearInterval
 */
export class RealTimeService implements TimeService {
	setTimeout(fn: () => void, delay: number): NodeJS.Timeout {
		return setTimeout(fn, delay);
	}

	clearTimeout(id: NodeJS.Timeout): void {
		clearTimeout(id);
	}

	setInterval(fn: () => void, delay: number): NodeJS.Timeout {
		return setInterval(fn, delay);
	}

	clearInterval(id: NodeJS.Timeout): void {
		clearInterval(id);
	}
}

/**
 * Controllable time service for testing
 * Allows explicit control over when timers fire via tick()
 */
export class ControllableTimeService implements TimeService {
	private nextId = 1;
	private timeouts = new Map<number, { fn: () => void; delay: number; remaining: number }>();
	private intervals = new Map<number, { fn: () => void; interval: number; elapsed: number }>();

	setTimeout(fn: () => void, delay: number): NodeJS.Timeout {
		const id = this.nextId++;
		this.timeouts.set(id, { fn, delay, remaining: delay });
		return id as any;
	}

	clearTimeout(id: NodeJS.Timeout): void {
		this.timeouts.delete(id as any);
	}

	setInterval(fn: () => void, interval: number): NodeJS.Timeout {
		const id = this.nextId++;
		this.intervals.set(id, { fn, interval, elapsed: 0 });
		return id as any;
	}

	clearInterval(id: NodeJS.Timeout): void {
		this.intervals.delete(id as any);
	}

	/**
	 * Advance time by the specified number of milliseconds
	 * Fires all timers that should trigger during this period in chronological order
	 *
	 * @param ms - Number of milliseconds to advance
	 */
	tick(ms: number): void {
		// Collect all events (timeouts and intervals) with their fire times
		const events: Array<{ fn: () => void; fireTime: number }> = [];

		// Process timeouts
		this.timeouts.forEach((timer, id) => {
			const fireTime = timer.remaining; // When it fires within the tick
			timer.remaining -= ms;
			if (timer.remaining <= 0) {
				events.push({ fn: timer.fn, fireTime });
				this.timeouts.delete(id);
			}
		});

		// Process intervals
		this.intervals.forEach(timer => {
			const oldElapsed = timer.elapsed;
			timer.elapsed += ms;

			// Calculate fire times within this tick
			let nextFire = timer.interval - oldElapsed; // Time until first fire
			while (nextFire <= ms) {
				events.push({ fn: timer.fn, fireTime: nextFire });
				nextFire += timer.interval;
			}

			// Update remaining elapsed time
			timer.elapsed = timer.elapsed % timer.interval;
		});

		// Sort all events by fire time and execute in chronological order
		events.sort((a, b) => a.fireTime - b.fireTime);
		events.forEach(({ fn }) => fn());
	}

	/**
	 * Clear all pending timers
	 * Useful for cleanup between tests
	 */
	reset(): void {
		this.timeouts.clear();
		this.intervals.clear();
	}

	/**
	 * Get the number of pending timeouts
	 * Useful for debugging tests
	 */
	getPendingTimeoutCount(): number {
		return this.timeouts.size;
	}

	/**
	 * Get the number of active intervals
	 * Useful for debugging tests
	 */
	getActiveIntervalCount(): number {
		return this.intervals.size;
	}
}

// Default instance for production use
export const realTimeService = new RealTimeService();
