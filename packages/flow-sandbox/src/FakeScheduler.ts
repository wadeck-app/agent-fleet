import type { FakeClock } from './FakeClock';
import type { CancelScheduled, Scheduler } from './Scheduler';

interface Pending {
	id: number;
	dueAt: number;
	callback: () => void;
}

/** A scheduler driven by a FakeClock: nothing fires until `advance` moves time past its due moment. */
export class FakeScheduler implements Scheduler {
	private readonly pending: Pending[] = [];
	private nextId = 0;

	constructor(private readonly clock: FakeClock) {}

	schedule(delayMs: number, callback: () => void): CancelScheduled {
		if (!Number.isFinite(delayMs) || delayMs < 0) {
			throw new RangeError(`FakeScheduler needs a non-negative delay, got ${delayMs}`);
		}
		const entry: Pending = { id: this.nextId++, dueAt: this.clock.now() + delayMs, callback };
		this.pending.push(entry);
		return () => {
			const index = this.pending.indexOf(entry);
			if (index >= 0) this.pending.splice(index, 1);
		};
	}

	/** Number of callbacks waiting. */
	get pendingCount(): number {
		return this.pending.length;
	}

	/**
	 * Moves the clock forward, firing every callback that becomes due, in due order, with the clock set to
	 * its due moment. Callbacks run synchronously; the caller awaits whatever work they started.
	 */
	advance(milliseconds: number): void {
		const target = this.clock.now() + milliseconds;
		for (;;) {
			const next = this.pending
				.filter(entry => entry.dueAt <= target)
				.sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];
			if (next === undefined) break;
			this.pending.splice(this.pending.indexOf(next), 1);
			const behind = next.dueAt - this.clock.now();
			if (behind > 0) this.clock.advance(behind);
			next.callback();
		}
		const rest = target - this.clock.now();
		if (rest > 0) this.clock.advance(rest);
	}
}
