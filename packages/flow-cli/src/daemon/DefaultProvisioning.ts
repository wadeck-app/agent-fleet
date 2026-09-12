import type { ProvisioningDecision, ProvisioningProvider, ProvisioningRequest } from 'extension-points';

/**
 * How long a declared source is given to supply a worker before the daemon forks one.
 *
 * Short on purpose. It is not a deadline for a machine to boot -- it is the window in which
 * an *already running* source is expected to answer, since a source that has to create a
 * worker races the local fork anyway and loses nothing by being beaten to it.
 */
export const DEFAULT_SOURCE_WAIT_MS = 3_000;

export interface DefaultProvisioningOptions {
	/**
	 * Milliseconds to wait for a declared source before forking locally.
	 *
	 * An option of this implementation rather than core configuration (D#26): another S8
	 * implementation may have no notion of a timeout at all, and hoisting this into the
	 * daemon's config would leak one implementation's parameter into the interface. Zero
	 * means "never wait", which is a valid configuration and not a competing design (D#25).
	 */
	waitForDeclaredSourcesMs?: number;
}

/**
 * Built-in S8: wait briefly for a declared source, then fork to cover the rest and warn.
 *
 * The three-way choice this encodes:
 *
 * - Nothing declared -> fork at once. There is nothing to wait for, and waiting would add
 *   latency to the zero-config path for no possible benefit.
 * - Something declared, wait not yet exhausted -> ask for nothing. Using capacity someone
 *   already launched is the preference (D#23), so it is worth a moment.
 * - Wait exhausted -> fork, and warn naming the sources that produced nothing. A violated
 *   preference is a warning, not a failure; a hard requirement is expressed with labels and
 *   fails on its own (P-4). Bounding the wait also bounds what a stale or forged registry
 *   entry can do -- it cannot stall the queue forever (T-10).
 */
export class DefaultProvisioning implements ProvisioningProvider {
	private readonly waitMs: number;

	constructor(options: DefaultProvisioningOptions = {}) {
		const waitMs = options.waitForDeclaredSourcesMs ?? DEFAULT_SOURCE_WAIT_MS;
		if (!Number.isFinite(waitMs) || waitMs < 0) {
			throw new Error(
				`waitForDeclaredSourcesMs must be zero or a positive number of milliseconds, got ${JSON.stringify(options.waitForDeclaredSourcesMs)}. Use 0 to fork immediately without waiting for a declared source.`
			);
		}
		this.waitMs = waitMs;
	}

	decide({ unmetDemand, waitingMs, declaredSources, allowance }: ProvisioningRequest): ProvisioningDecision {
		const wanted = Math.min(Math.max(unmetDemand, 0), Math.max(allowance, 0));
		if (wanted === 0) return { fork: 0 };

		if (declaredSources.length === 0) return { fork: wanted };

		if (waitingMs < this.waitMs) return { fork: 0 };

		const named = declaredSources.map(sourceId => `"${sourceId}"`).join(', ');
		return {
			fork: wanted,
			warning:
				`No worker arrived from declared source(s) ${named} within ${String(this.waitMs)} ms, ` +
				`so ${String(wanted)} local worker(s) were forked to run the queued step(s). ` +
				`Check that the source is reachable and its worker is connected with "flow worker list".`,
		};
	}
}
