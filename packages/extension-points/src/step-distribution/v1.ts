/**
 * Extension point S3 -- step distribution.
 *
 * Orders the workers that are already allowed to run a step, so the daemon can take the
 * first one. Ordering only: an implementation **must not** drop candidates (D#24).
 *
 * That restriction is the whole reason this is separate from S4 (`worker-acceptance`).
 * Expressing "prefer registered workers" as a filter is the obvious mistake, and it turns
 * a parallel flow into a serial one the moment a single registered worker exists -- every
 * step queues behind it while forked capacity sits unused. Preference orders acquisition;
 * it never caps it.
 */
import type { WorkerCandidate } from '../worker-acceptance/v1.js';

export type { WorkerCandidate };

export interface StepDistributionProvider {
	/**
	 * Returns the candidates in the order they should be tried.
	 *
	 * The returned array must contain exactly the candidates it was given. Returning fewer
	 * is a bug the daemon reports rather than honours, because the failure it produces --
	 * a flow that runs at a fraction of its declared parallelism -- is otherwise invisible.
	 *
	 * Synchronous for the same reason as S4: it runs inside the dispatch loop.
	 */
	order(candidates: WorkerCandidate[]): WorkerCandidate[];
}
