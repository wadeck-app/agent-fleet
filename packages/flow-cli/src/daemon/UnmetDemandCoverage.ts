import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { WorkerProvisioner } from './WorkerProvisioner.js';

/**
 * How often dispatch is retried while S8 is waiting for a declared source.
 *
 * Needed because with no live worker there is no `ready` message coming and no other event
 * to re-run dispatch: without this the wait would never end and the queue would sit still.
 */
const DEMAND_RECHECK_MS = 250;

/**
 * Acts on steps nothing could take, per the provisioning extension point (S8).
 *
 * The daemon owns the clock here and hands S8 how long the demand has gone unserved, so
 * the default can wait briefly for a declared source without anything blocking (D#25,
 * D#66). Waiting is expressed as forking nothing yet, and the next pass asks again --
 * either when a worker registers or when the next step becomes ready.
 *
 * The re-check timer matters: with no live worker there is no `ready` message coming, so
 * nothing else would ever re-run dispatch and the wait would never end.
 */
export class UnmetDemandCoverage {
	/** When the current episode of unserved demand began, for the S8 wait (D#25) */
	private unmetDemandSince: number | undefined;
	/** Pending re-run of dispatch while S8 waits; nothing else would trigger one */
	private demandRecheck: ReturnType<typeof setTimeout> | undefined;

	/**
	 * @param rerunDispatch Runs a dispatch pass again once the S8 wait can have elapsed.
	 * @param requestFromDeclaredSources Asks every declared source for a worker (D#66). Injected because contacting
	 *        a source needs the daemon's own wiring, which this class deliberately knows nothing about.
	 */
	constructor(
		private readonly provisioner: WorkerProvisioner,
		private readonly rerunDispatch: () => void,
		private readonly requestFromDeclaredSources?: () => void
	) {}

	/** Called at the end of every dispatch pass with the number of steps nothing could run. */
	cover(unmetDemand: number): void {
		if (unmetDemand === 0) {
			this.unmetDemandSince = undefined;
			this.clearRecheck();
			return;
		}

		const now = Date.now();
		const isNewEpisode = this.unmetDemandSince === undefined;
		this.unmetDemandSince ??= now;

		// Ask the declared sources first, and exactly once for this episode (D#66). Before this
		// they were contacted only at daemon startup, which made the S8 wait a wait for something
		// nobody had been asked for -- and put remote capacity out of reach of any run that began
		// later. Once per episode, not once per pass: the re-check fires several times a second.
		if (isNewEpisode) {
			this.requestFromDeclaredSources?.();
		}

		const plan = this.provisioner.planProvisioning(unmetDemand, now - this.unmetDemandSince);

		// Checked rather than trusted: this runs from a timer as well as from a message, and an
		// exception there takes the daemon down with no stack a user could act on. Reported and
		// the re-check dropped, so the same broken answer is not repeated four times a second;
		// the queue resumes on the next real event.
		if (typeof plan?.fork !== 'number' || !Number.isFinite(plan.fork)) {
			process.stderr.write(
				`[CommandHandler] the provisioning plugin returned no usable decision (${JSON.stringify(plan)}); it must return { fork: <number> }. ${String(unmetDemand)} step(s) are waiting and no worker was requested.\n`
			);
			this.clearRecheck();
			return;
		}

		if (plan.fork === 0) {
			this.scheduleRecheck();
			return;
		}

		if (plan.warning !== undefined) {
			process.stderr.write(`[CommandHandler] ${plan.warning}\n`);
		}
		this.clearRecheck();
		// The demand is now covered as far as this pass can tell; a new episode starts its
		// own wait rather than inheriting this one's elapsed time.
		this.unmetDemandSince = undefined;

		for (let i = 0; i < plan.fork; i++) {
			// Obtaining a worker is asynchronous by contract (D#66) and dispatch resumes when
			// it registers, so this is deliberately not awaited. A failure is reported rather
			// than swallowed: the queue would otherwise stall with no explanation.
			void this.provisioner.provision().catch((err: unknown) => {
				process.stderr.write(`[CommandHandler] failed to obtain a worker: ${getErrorMessage(err)}\n`);
			});
		}
	}

	/**
	 * Drops work scheduled for later, when the daemon is shutting down.
	 *
	 * Without this the pending re-check survives the shutdown and runs against a daemon that
	 * has closed its listener, so it asks for capacity nothing can deliver and reports against
	 * torn-down collaborators. The timer is unref'd, so it never *delays* exit -- it just
	 * should not fire after the decision to stop.
	 */
	stop(): void {
		this.clearRecheck();
	}

	/** Re-runs dispatch once the S8 wait can have elapsed, since nothing else would. */
	private scheduleRecheck(): void {
		if (this.demandRecheck !== undefined) {
			return;
		}
		this.demandRecheck = setTimeout(() => {
			this.demandRecheck = undefined;
			this.rerunDispatch();
		}, DEMAND_RECHECK_MS);
		// Never the reason the daemon stays up: idle shutdown is decided elsewhere (D#51).
		this.demandRecheck.unref?.();
	}

	private clearRecheck(): void {
		if (this.demandRecheck === undefined) {
			return;
		}
		clearTimeout(this.demandRecheck);
		this.demandRecheck = undefined;
	}
}
