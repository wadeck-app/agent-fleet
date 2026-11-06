import { RunSandboxName } from './RunSandboxName';
import { SandboxError } from './SandboxError';
import type { SandboxRuntime } from './SandboxRuntime';
import { SerialQueue } from './SerialQueue';

/**
 * The cap on sandboxes that run at the same time (T-13), shared by every SandboxLifecycle of one process.
 *
 * "Running" = a plugin sandbox (name marker) whose sbx status is not `stopped`, plus the ones this process
 * reserved but sbx does not list yet. Counting through `list()` also sees other wrapper processes. Two
 * processes asking at the same instant can both pass: the cap is a guard rail against runaway use, not a lock.
 * A stopped sandbox holds a slot only while running: restarting it asks again.
 */
export class SandboxCapacity {
	private readonly queue = new SerialQueue();
	private readonly reserved = new Set<string>();

	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly maxConcurrentSandboxes: number
	) {
		if (!Number.isInteger(maxConcurrentSandboxes) || maxConcurrentSandboxes < 1) {
			throw new SandboxError(
				'invalid-options',
				`maxConcurrentSandboxes must be a whole number of at least 1, got ${maxConcurrentSandboxes}`
			);
		}
	}

	/** Reserves a slot for `name` (idempotent) or throws `capacity-exceeded`. */
	acquire(name: string): Promise<void> {
		return this.queue.run(async () => {
			if (this.reserved.has(name)) return;
			const running = new Set<string>(this.reserved);
			for (const info of await this.runtime.list()) {
				if (RunSandboxName.parse(info.name) !== undefined && info.status !== 'stopped') running.add(info.name);
			}
			running.delete(name);
			if (running.size >= this.maxConcurrentSandboxes) {
				throw new SandboxError(
					'capacity-exceeded',
					`Cannot start sandbox "${name}": ${running.size} plugin sandboxes are already running (maxConcurrentSandboxes is ${this.maxConcurrentSandboxes}): ${[...running].sort().join(', ')}. ` +
						'Wait for a run to finish, stop idle ones with `leftover list` / the wrapper, or raise the maxConcurrentSandboxes option.',
					{ sandbox: name }
				);
			}
			this.reserved.add(name);
		});
	}

	/** Gives the slot back (the sandbox was stopped, removed or never started). */
	release(name: string): void {
		this.reserved.delete(name);
	}
}
