import type { WorkerSourceProvider } from '../worker-source/v1.js';

/**
 * Extension point worker-type -- a kind of worker supplied by a plugin (for example one that runs steps inside a
 * sandbox).
 *
 * Composes with `worker-source` v1 instead of stretching it: the source part still only asks a worker to join and
 * returns no handle. What this point adds is the lifecycle around it -- be told a run ended, and be disposed.
 *
 * There is deliberately no plugin-to-worker channel and no socket handle. The daemon talks to a worker over the
 * worker's own connection (it sends `run_end` there); the plugin only reacts to the notification it is given.
 */

/** Why a run ended, as told to the workers that served it. */
export type RunEndReason = 'completed' | 'failed' | 'daemon_stopping';

/**
 * A run (one execution of a flow) this worker type served has ended.
 *
 * In-flight steps may still report after `run_end`; their results are dropped.
 *
 * "Ended" is not "quiet": a sibling step can still be executing when a run fails terminally. The daemon waits a
 * bounded time for the workers that served the run to settle before it announces the end, so after that bound the
 * announcement goes out with a sibling possibly still running.
 *
 * Worst-case wait before the run's workspace is released: THREE ack timeouts per run (the settle wait, the
 * acknowledgement wait, then `run.onRunEnded`), not one.
 *
 * `daemon_stopping` is a best-effort notice: it is written just before the daemon closes the worker sockets, and a
 * worker the daemon did not create is closed right after, so it may never get to acknowledge. Do not rely on it for
 * cleanup that must happen; reap what is left at the next start.
 */
export interface RunEndEvent {
	executionId: string;
	reason: RunEndReason;
}

/** What the daemon hands a worker type when it builds an instance for one declared source. */
export interface WorkerTypeContext {
	/** The declared worker source this instance belongs to. */
	sourceId: string;
	/** The source entry's `options`, unvalidated: the implementation owns their shape and must reject what it cannot use. */
	options: unknown;
}

/** One worker type bound to one declared source. */
export interface WorkerTypeInstance {
	/** Obtains workers for the source (worker-source v1, unchanged: no handle comes back). */
	source: WorkerSourceProvider;
	/**
	 * Called once per run this type served (once per source, however many of its workers took part), after the workers
	 * acknowledged the end of the run (or the wait expired) and before the run's workspace is released. Bounded by the
	 * ack timeout: a rejection or a hang is logged with the source and the execution, never blocks the release further.
	 * Only called for a source declared with a plugin ref, and ONLY when a worker of the source declared `run-events`
	 * and was handed a step of the run: for any other worker it is never called, so the type cannot rely on it.
	 * Omit when the type has no per-run resources.
	 */
	run?: { onRunEnded(event: RunEndEvent): Promise<void> };
	/**
	 * Releases everything the instance holds. Called once when the daemon stops (after the run-end hooks) and when the
	 * source is no longer declared (noticed at the daemon's next contact with its sources, as `flow worker source remove` runs in
	 * another process). Errors are logged, and a dispose that takes more than 30s is given up on.
	 */
	dispose(): Promise<void>;
}

/**
 * Builds the instance for one declared source. Rejecting names the source in the daemon's error, so say what is wrong.
 * The daemon gives up on a factory that has not settled after 30s. A module that fails to import, or is edited, stays
 * as Node first loaded it until the daemon restarts: the fix for a load error is a restart, not a retry.
 * `context.options` has its `${ENV_VAR}` references already replaced from the daemon's environment.
 */
export type WorkerTypeFactory = (context: WorkerTypeContext) => Promise<WorkerTypeInstance>;
