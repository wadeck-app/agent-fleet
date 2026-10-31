import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { WorkerProvisioner } from './WorkerProvisioner.js';

/**
 * How often dispatch is retried while S8 is waiting for a declared source.
 *
 * Needed because with no live worker there is no `ready` message coming and no other event
 * to re-run dispatch: without this the wait would never end and the queue would sit still.
 */
const DEMAND_RECHECK_MS = 250;

/** Longest wait before the re-check asks again after a dispatch pass that threw, and the least between two stderr lines about it. */
const MAX_RECHECK_RETRY_MS = 30_000;

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
	/** Bound worker types whose sources were already asked for a worker while their steps keep waiting */
	private readonly requestedBoundTypes = new Set<string>();
	/** Pending re-run of dispatch while S8 waits; nothing else would trigger one */
	private demandRecheck: ReturnType<typeof setTimeout> | undefined;
	/** Dispatch passes of the re-check that threw since one last went through; sets how long the next retry waits. */
	private consecutiveRecheckFailures = 0;
	/** When the failure of the re-check was last written to stderr, and how many were left out since. */
	private lastRecheckReportAt: number | undefined;
	private unreportedRecheckFailures = 0;

	/**
	 * @param rerunDispatch Runs a dispatch pass again once the S8 wait can have elapsed.
	 * @param requestFromDeclaredSources Asks the declared sources for a worker (D#66): every one, or only the sources
	 *        of the given worker types. Injected because contacting a source needs the daemon's own wiring, which this
	 *        class deliberately knows nothing about.
	 */
	constructor(
		private readonly provisioner: WorkerProvisioner,
		private readonly rerunDispatch: () => void,
		private readonly requestFromDeclaredSources?: (workerTypes?: ReadonlySet<string>) => void
	) {}

	/**
	 * Called at the end of every dispatch pass.
	 *
	 * @param unmetDemand steps nothing could run that a host worker could: the only ones worth forking for.
	 * @param boundTypes worker types that unplaced steps of bound runs wait for. A host worker can never run those
	 *        steps, so they are not counted in `unmetDemand`: nothing is planned or forked for them, only the sources
	 *        of their type are asked, once while they wait. Their deadline is the dispatcher's, not a re-check's.
	 */
	cover(unmetDemand: number, boundTypes: ReadonlySet<string> = new Set()): void {
		const newBoundTypes = new Set([...boundTypes].filter(type => !this.requestedBoundTypes.has(type)));
		for (const type of [...this.requestedBoundTypes]) {
			if (!boundTypes.has(type)) {
				this.requestedBoundTypes.delete(type);
			}
		}
		for (const type of newBoundTypes) {
			this.requestedBoundTypes.add(type);
		}

		if (unmetDemand === 0) {
			this.unmetDemandSince = undefined;
			this.clearRecheck();
			if (newBoundTypes.size > 0) {
				this.requestFromDeclaredSources?.(newBoundTypes);
			}
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
			this.requestFromDeclaredSources?.(undefined);
		} else if (newBoundTypes.size > 0) {
			this.requestFromDeclaredSources?.(newBoundTypes);
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
	private scheduleRecheck(delayMs: number = DEMAND_RECHECK_MS): void {
		if (this.demandRecheck !== undefined) {
			return;
		}
		this.demandRecheck = setTimeout(() => {
			this.demandRecheck = undefined;
			try {
				this.rerunDispatch();
				this.consecutiveRecheckFailures = 0;
			} catch (err) {
				this.handleRecheckFailure(err);
			}
		}, delayMs);
		// Never the reason the daemon stays up: idle shutdown is decided elsewhere (D#51).
		this.demandRecheck.unref?.();
	}

	/**
	 * A throw out of this timer would be an uncaught exception, and the daemon has no handler for those. The pass failed,
	 * not the demand: steps are still waiting and only a pass can serve or fail them. So the failure is reported, never
	 * swallowed, and a pass is asked for again, later each time (250ms doubling up to {@link MAX_RECHECK_RETRY_MS}) so a
	 * permanent error costs one attempt every 30s, not four a second. A pass that goes through starts the delay over.
	 *
	 * The report is bounded the same way: at most one line per {@link MAX_RECHECK_RETRY_MS}, saying how many failures
	 * since the last line were left out. This also bounds the lines when a failing pass re-arms the 250ms re-check by
	 * itself before it throws (the retry here then finds the timer already armed and leaves it).
	 */
	private handleRecheckFailure(err: unknown): void {
		this.consecutiveRecheckFailures++;
		const retryMs = Math.min(DEMAND_RECHECK_MS * 2 ** this.consecutiveRecheckFailures, MAX_RECHECK_RETRY_MS);
		const now = Date.now();
		if (this.lastRecheckReportAt === undefined || now - this.lastRecheckReportAt >= MAX_RECHECK_RETRY_MS) {
			const left = this.unreportedRecheckFailures;
			const omitted = left === 0 ? '' : ` (${String(left)} similar failure(s) since the last line not shown)`;
			process.stderr.write(
				`[UnmetDemandCoverage] dispatch pass of the demand re-check failed (${String(this.consecutiveRecheckFailures)} in a row), asking again in ${String(retryMs / 1000)}s: ${getErrorMessage(err)}${omitted}\n`
			);
			this.lastRecheckReportAt = now;
			this.unreportedRecheckFailures = 0;
		} else {
			this.unreportedRecheckFailures++;
		}
		this.scheduleRecheck(retryMs);
	}

	private clearRecheck(): void {
		if (this.demandRecheck === undefined) {
			return;
		}
		clearTimeout(this.demandRecheck);
		this.demandRecheck = undefined;
	}
}
