/**
 * Extension point S8 -- provisioning.
 *
 * Decides what to do about demand no live worker can serve: wait for capacity that may
 * still arrive, or create some locally, or neither.
 *
 * Deliberately a **synchronous decision, not an action**. The daemon asks again on every
 * dispatch pass and hands over how long the demand has gone unserved, so an implementation
 * expresses "wait" by asking for nothing yet rather than by sleeping. A provider that
 * owned its own timer would hold up the dispatch of every other execution while it waited.
 */

export interface ProvisioningRequest {
	/** Queued steps that no connected worker can currently run. */
	unmetDemand: number;
	/**
	 * How long this demand has gone unserved, in milliseconds.
	 *
	 * Zero on the pass that first notices it. This is what makes a bounded wait possible
	 * without the provider keeping state or blocking.
	 */
	waitingMs: number;
	/**
	 * Ids of the declared worker sources, which may still supply a worker.
	 *
	 * Empty when nothing is declared -- there is then nothing to wait for, and an
	 * implementation that waited anyway would add latency to the zero-config path for no
	 * possible benefit.
	 */
	declaredSources: string[];
	/**
	 * How many more workers the daemon may have right now, from its concurrency limit.
	 *
	 * An implementation must not ask for more than this; the daemon caps it regardless.
	 */
	allowance: number;
}

export interface ProvisioningDecision {
	/** How many workers to create locally now. Zero means "keep waiting". */
	fork: number;
	/**
	 * Something the user needs to know, reported once per episode of unmet demand.
	 *
	 * The reason this exists: falling back to a locally forked worker because a declared
	 * source produced nothing is a violated *preference*, which warrants a warning rather
	 * than a failure (D#25) -- but it must name the absentee, or the user sees a working
	 * flow and never learns their remote capacity is unreachable.
	 */
	warning?: string;
}

export interface ProvisioningProvider {
	decide(request: ProvisioningRequest): ProvisioningDecision;
}
