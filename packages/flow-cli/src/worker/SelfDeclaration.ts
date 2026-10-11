import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { WorkerSourceRegistry } from '../daemon/WorkerSourceRegistry.js';

/** Lets the caller take its own entry back out again. */
export interface SelfDeclarationHandle {
	sourceId: string;
	release: () => void;
}

/**
 * Records a worker that is alive and waiting, so something other than itself knows it exists.
 *
 * This is D#5's first kind of registry entry -- "a worker already alive and waiting to be
 * contacted" -- which nothing wrote until now: a `flow worker` started in a terminal left no trace,
 * so a daemon starting later had no idea it existed, and `flow worker list` could not mention it
 * while the socket was down.
 *
 * It records intent and configuration, never availability: the entry declares capacity of one and
 * carries the pid, so a reader can tell a waiting worker from a leftover, and dispatch still only
 * ever targets a live connection (D#4).
 *
 * Failing to write is reported and survived. Registration is what makes a worker usable; this only
 * makes it visible, so losing visibility must not cost the user their worker.
 */
export function declareSelf(
	daemonDir: string,
	worker: { projects: string[]; labels: string[]; pid: number; nudgeUrl?: string }
): SelfDeclarationHandle | undefined {
	const registry = new WorkerSourceRegistry(daemonDir);
	const sourceId = `terminal-${String(worker.pid)}`;

	try {
		registry.declare({
			sourceId,
			// Nothing can reach out to it: it dials in on its own schedule, which is what inbound
			// means (D#18). The nudge URL is how it learns when to, for both local and remote workers.
			provider: 'built-in:inbound',
			labels: [...worker.labels],
			maxWorkers: 1,
			options: { projects: [...worker.projects] },
			pid: worker.pid,
			...(worker.nudgeUrl !== undefined ? { nudgeUrl: worker.nudgeUrl } : {}),
		});
	} catch (err) {
		console.error(
			`[warn] this worker could not record itself in the registry, so it will not be listed while disconnected: ${getErrorMessage(err)}`
		);
		return undefined;
	}

	let released = false;
	return {
		sourceId,
		release: () => {
			if (released) return;
			released = true;
			try {
				registry.remove(sourceId);
			} catch (err) {
				// The pid is in the entry, so a later reader prunes it; saying so is enough.
				console.error(`[warn] could not remove this worker's registry entry: ${getErrorMessage(err)}`);
			}
		},
	};
}

/** How often a worker retries recording itself after a failed attempt. */
const SELF_DECLARATION_RETRY_MS = 30_000;

/**
 * Keeps retrying {@link declareSelf} on a timer until it succeeds, instead of trying once at
 * startup and leaving a failure permanent for the rest of the process's life.
 *
 * A worker whose first attempt failed (the registry file was briefly locked, a transient
 * disk error, ...) used to warn once -- to whatever terminal happened to be looking at that
 * exact instant -- and then run forever looking and behaving exactly like a healthy,
 * discoverable worker: same startup banner, same "Waiting for steps" line, same log cadence.
 * Nothing ever flagged the degraded state again, and a worker that can never be given a step
 * because it was never discoverable is the one case that must not look identical to a healthy
 * one. Retrying surfaces the warning again on every failed attempt (so it is not a single
 * easily-missed line) and recovers automatically once the underlying problem clears, without
 * requiring the worker to be restarted.
 */
export class SelfDeclarationManager {
	private handle: SelfDeclarationHandle | undefined;
	private retryTimer: ReturnType<typeof setInterval> | undefined;
	private released = false;

	constructor(
		private readonly daemonDir: string,
		private readonly worker: { projects: string[]; labels: string[]; pid: number; nudgeUrl?: string }
	) {
		this.attempt();
	}

	/** This process's declared id, once an attempt has actually succeeded. */
	get sourceId(): string | undefined {
		return this.handle?.sourceId;
	}

	/** Stops retrying and removes the registry entry, if one was ever recorded. */
	release(): void {
		if (this.released) return;
		this.released = true;
		if (this.retryTimer !== undefined) {
			clearInterval(this.retryTimer);
			this.retryTimer = undefined;
		}
		this.handle?.release();
	}

	private attempt(): void {
		// declareSelf() itself prints the "[warn] ... could not record itself ..." line on
		// every failed call, so a failure here is already said out loud -- retrying is what
		// makes it recur instead of being said exactly once.
		const handle = declareSelf(this.daemonDir, this.worker);
		if (handle === undefined) {
			this.retryTimer ??= setInterval(() => this.attempt(), SELF_DECLARATION_RETRY_MS);
			return;
		}

		const hadFailed = this.retryTimer !== undefined;
		if (this.retryTimer !== undefined) {
			clearInterval(this.retryTimer);
			this.retryTimer = undefined;
		}
		this.handle = handle;
		if (hadFailed) {
			console.error(
				`[ok] this worker's registry entry recovered -- it is now listed as "${handle.sourceId}" while disconnected.`
			);
		}
	}
}
