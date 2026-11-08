/**
 * The runs that wait for a workspace (a pool with no free slot) in this daemon: accepted and recorded, but with no
 * scheduler, worker or concurrency permit yet. They count as active work for the idle exit and the update, otherwise the
 * daemon would stop and lose them (the record is kept, but nothing would start them until the next daemon start).
 */
export class WaitingRuns {
	private readonly cancels = new Map<string, () => void>();

	/** @param cancel Stops the wait of this run in its workspace provider. */
	add(executionId: string, cancel: () => void): void {
		this.cancels.set(executionId, cancel);
	}

	/** The run stopped waiting (it started, failed or was cancelled). */
	remove(executionId: string): void {
		this.cancels.delete(executionId);
	}

	has(executionId: string): boolean {
		return this.cancels.has(executionId);
	}

	/** Stops the wait of a run. False when the run does not wait here. */
	cancel(executionId: string): boolean {
		const cancel = this.cancels.get(executionId);
		if (cancel === undefined) {
			return false;
		}
		cancel();
		return true;
	}

	/** Stops the wait of every run (the daemon is stopping). */
	cancelAll(): void {
		for (const cancel of [...this.cancels.values()]) {
			cancel();
		}
	}

	count(): number {
		return this.cancels.size;
	}
}
