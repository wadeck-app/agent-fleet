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
	 * Called once per run this type served, after the workers acknowledged the end of the run and before the run's
	 * workspace is released. Omit when the type has no per-run resources.
	 */
	run?: { onRunEnded(event: RunEndEvent): Promise<void> };
	/** Releases everything the instance holds; called when the source is removed or the daemon stops. */
	dispose(): Promise<void>;
}

/** Builds the instance for one declared source. Rejecting names the source in the daemon's error, so say what is wrong. */
export type WorkerTypeFactory = (context: WorkerTypeContext) => Promise<WorkerTypeInstance>;
