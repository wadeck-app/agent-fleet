import type { AuthenticationProvider, ProvisioningDecision, ProvisioningProvider } from 'extension-points';
import type { WebSocket } from 'ws';

import type { WorkerReady } from '../ipc/Protocol';
import { DefaultProvisioning } from './DefaultProvisioning.js';
import type { ForkWorkerSource } from './ForkWorkerSource.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import type { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

/**
 * Decides when more capacity is wanted, and which workers are allowed to join.
 *
 * Kept apart from {@link WorkerRegistry}, which only knows who is connected, and from
 * {@link ForkWorkerSource}, which only knows how to make one worker. Capacity is
 * counted from live connections plus workers already asked for -- never from a child
 * process `exit` handler (D#14), because an inbound worker has no child process for
 * the daemon to watch.
 */
export class WorkerProvisioner {
	constructor(
		private readonly concurrencyLimit: number,
		private readonly registry: WorkerRegistry,
		private readonly forkSource: ForkWorkerSource,
		private readonly authenticator: AuthenticationProvider,
		private readonly sources: Pick<WorkerSourceRegistry, 'find' | 'list'>,
		private readonly provisioning: ProvisioningProvider = new DefaultProvisioning(),
		/**
		 * Where a refusal is reported.
		 *
		 * Injected because the default -- `process.stderr` -- goes nowhere: the daemon runs detached
		 * with `stdio: 'ignore'`. Every refusal was therefore invisible, and a worker presenting a
		 * stale credential (which every worker does once the daemon rotates its token on restart)
		 * retried forever against a silent wall while `flow worker list` showed nothing connected.
		 */
		private readonly report: (message: string) => void = message => process.stderr.write(`${message}\n`)
	) {}

	/** Workers connected or already requested. */
	get committedCount(): number {
		return this.registry.liveCount + this.forkSource.pendingCount;
	}

	canProvision(): boolean {
		return this.committedCount < this.concurrencyLimit;
	}

	/**
	 * Asks S8 what to do about steps no connected worker can run.
	 *
	 * @param unmetDemand - queued steps nothing can currently take
	 * @param waitingMs - how long that demand has gone unserved. Passed in because the
	 *        daemon owns the clock: the provider decides, it never sleeps (see S8).
	 */
	planProvisioning(unmetDemand: number, waitingMs: number): ProvisioningDecision {
		const allowance = Math.max(this.concurrencyLimit - this.committedCount, 0);
		const decision = this.provisioning.decide({
			unmetDemand,
			waitingMs,
			// Only the sources that have produced nothing. A source with a worker connected is
			// not what the wait is for, and naming it in the warning would send the user to
			// inspect a machine that is doing its job (D#25).
			declaredSources: this.sources
				.list()
				.filter(source => this.registry.countForSource(source.sourceId) === 0)
				.map(source => source.sourceId),
			allowance,
		});
		// The limit is the daemon's to enforce, not the plugin's to respect: an
		// implementation asking for more must not be able to exceed the configured
		// concurrency, and silently honouring it would make the limit meaningless.
		if (decision.fork > allowance) {
			process.stderr.write(
				`[WorkerProvisioner] the provisioning plugin asked for ${String(decision.fork)} workers but only ${String(allowance)} are allowed under the concurrency limit; capping it.\n`
			);
			return { ...decision, fork: allowance };
		}
		return decision;
	}

	/**
	 * Asks the source for one more worker.
	 *
	 * Rejects rather than resolving quietly when the source cannot deliver: unmet demand
	 * has to be visible, otherwise the queue simply stalls with no explanation.
	 */
	async provision(): Promise<void> {
		await this.forkSource.obtainWorker({
			daemonEndpoint: 'loopback',
			sourceId: 'built-in:fork',
			projects: [],
		});
	}

	/**
	 * Admits a worker into the registry, or refuses it.
	 *
	 * Three routes, in order: a connection already admitted is simply refreshed; a process
	 * this daemon forked is recognised by provenance; anything else must satisfy the
	 * `authentication` extension point and its source's cap.
	 *
	 * @returns false when the worker was refused, having already logged why and closed the
	 *          socket -- the caller must not go on to dispatch to it.
	 */
	registerWorker(ws: WebSocket, registration: Omit<WorkerReady, 'type'>): boolean {
		// A worker announces `ready` again after every step, so most registrations are
		// refreshes of a connection already admitted. Re-running admission on those would
		// count the worker against its own source cap and refuse it the moment it finished
		// a step -- destroying the worker the user launched, which is the failure D#48
		// exists to prevent. The socket was authenticated when it first joined.
		if (this.registry.describe(ws) !== undefined) {
			// Labels are re-applied, not carried over: this refresh replaces the recorded
			// registration, so skipping inheritance here would silently strip a worker's source
			// labels after its first step and stop it matching the steps it was declared for.
			this.registry.register(ws, this.withSourceLabels(registration));
			return true;
		}

		// A worker this daemon forked is recognised by provenance and needs no credential:
		// it is a loopback child the daemon created (D#27).
		if (this.forkSource.hasSpawned(registration.pid)) {
			this.forkSource.acknowledgeConnection(registration.pid);
			// It exists only to serve this daemon, so it may be told to exit when idle.
			this.registry.register(ws, registration, { ephemeral: true });
			return true;
		}

		return this.admitExternalWorker(ws, registration);
	}

	/**
	 * Admits a worker the daemon did not create -- a terminal the user opened, or another
	 * machine. It must name its source and present that source's credential, and it is
	 * never marked ephemeral: it outlives this daemon by design (D#51).
	 */
	private admitExternalWorker(ws: WebSocket, registration: Omit<WorkerReady, 'type'>): boolean {
		const { sourceId } = registration;
		const describeWorker = sourceId ? `worker for source "${sourceId}"` : 'worker naming no source';

		const auth = this.authenticator.authenticate({
			token: registration.authToken,
			sourceId,
			loopback: isLoopbackPeer(ws),
		});
		if (!auth.ok) {
			return this.refuse(ws, `refused a ${describeWorker}: ${auth.reason}`);
		}

		// A worker naming no source is the zero-config path: `flow worker` in a terminal,
		// authenticated with the daemon's own token over loopback. Caps and inherited labels
		// apply per declared source, so there is nothing to look up for it.
		if (sourceId !== undefined && sourceId !== '') {
			const source = this.sources.find(sourceId);
			if (source === undefined) {
				return this.refuse(
					ws,
					`refused a worker for source "${sourceId}": that source is not declared. Run "flow worker source add ${sourceId} --provider <provider>".`
				);
			}

			// D#64 / T-03: without a per-source cap one registrant could absorb every step.
			const liveForSource = this.registry.countForSource(sourceId);
			if (liveForSource >= source.maxWorkers) {
				return this.refuse(
					ws,
					`refused a worker for source "${sourceId}": it already has ${String(liveForSource)} of ${String(source.maxWorkers)} allowed workers connected. Raise maxWorkers on the source to allow more.`
				);
			}
		}

		this.registry.register(ws, this.withSourceLabels(registration), { ephemeral: false });
		return true;
	}

	/**
	 * Adds the labels the worker's source declared to the ones it declared itself (D#30).
	 *
	 * Applied by the daemon rather than trusted from the worker: the source entry is the
	 * operator's statement about that machine, so a source declaring `--labels gpu` must affect
	 * routing whether or not each worker remembers to repeat it.
	 *
	 * A union, not a replacement -- the source says what the operator knows, `--labels` says
	 * what the machine knows about itself -- and de-duplicated, because a worker re-registers
	 * after every step and a growing list would be a slow leak.
	 */
	private withSourceLabels(registration: Omit<WorkerReady, 'type'>): Omit<WorkerReady, 'type'> {
		const { sourceId } = registration;
		if (sourceId === undefined || sourceId === '') return registration;

		const inherited = this.sources.find(sourceId)?.labels ?? [];
		if (inherited.length === 0) return registration;

		const labels = [...(registration.labels ?? [])];
		for (const label of inherited) {
			if (!labels.includes(label)) labels.push(label);
		}
		return { ...registration, labels };
	}

	private refuse(ws: WebSocket, reason: string): false {
		this.report(`[WorkerProvisioner] ${reason}`);
		ws.terminate();
		return false;
	}
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Whether the peer connected over loopback.
 *
 * Derived from the socket rather than assumed, even though v1 only binds loopback: an
 * assumed `true` would silently grant loopback-only trust to remote peers the moment a
 * non-loopback transport lands (Phase 4a). Unknown addresses are treated as non-loopback,
 * so the failure direction is refusal rather than over-trust.
 */
function isLoopbackPeer(ws: WebSocket): boolean {
	// violations-suppress: ts/no-unsafe-type-cast ws exposes no public accessor for the underlying socket, and the remote address is the only way to tell a loopback peer from a remote one
	const address = (ws as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
	if (address === undefined) return false;
	return LOOPBACK_ADDRESSES.has(address);
}
