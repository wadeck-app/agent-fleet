/**
 * A list a test fills from an event handler and awaits on: `waitFor` resolves in the very turn of the push that
 * makes the predicate true. No polling and no timer; a condition that never comes is reported by the test timeout
 * of the runner, which names the test.
 */
export class ObservedList<T> {
	readonly items: T[] = [];
	private readonly waiters: { predicate: (items: readonly T[]) => boolean; resolve: () => void }[] = [];

	push(item: T): void {
		this.items.push(item);
		for (const waiter of this.waiters.splice(0)) {
			if (waiter.predicate(this.items)) waiter.resolve();
			else this.waiters.push(waiter);
		}
	}

	get length(): number {
		return this.items.length;
	}

	waitFor(predicate: (items: readonly T[]) => boolean): Promise<void> {
		if (predicate(this.items)) return Promise.resolve();
		return new Promise(resolve => this.waiters.push({ predicate, resolve }));
	}

	/** Resolves once the list holds at least `count` items. */
	waitForCount(count: number): Promise<void> {
		return this.waitFor(items => items.length >= count);
	}
}
