import type { AuthenticationProvider } from 'extension-points';
import type { WebSocket } from 'ws';

import type { WorkerReady } from '../ipc/Protocol';
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
		private readonly sources: Pick<WorkerSourceRegistry, 'find'>
	) {}

	/** Workers connected or already requested. */
	get committedCount(): number {
		return this.registry.liveCount + this.forkSource.pendingCount;
	}

	canProvision(): boolean {
		return this.committedCount < this.concurrencyLimit;
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
	 * Admission is still provenance-based: only a process this daemon spawned is
	 * recognised. That is deliberately unchanged until the `authentication` extension
	 * point ships (Phase 2a) -- accepting an unverified `authToken` in the meantime would
	 * open the daemon to any local process, since nothing yet checks the value. An
	 * unrecognised registrant could otherwise cancel a real worker's connect timeout or
	 * receive a dispatched step.
	 */
	registerWorker(ws: WebSocket, registration: Omit<WorkerReady, 'type'>): boolean {
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
		if (sourceId === undefined || sourceId === '') {
			return this.refuse(
				ws,
				`refused a worker this daemon did not create, pid ${String(registration.pid)}: it named no source. Declare one with "flow worker source add" and pass its id.`
			);
		}

		const source = this.sources.find(sourceId);
		if (source === undefined) {
			return this.refuse(
				ws,
				`refused a worker for source "${sourceId}": that source is not declared. Run "flow worker source add ${sourceId} --provider <provider>".`
			);
		}

		const auth = this.authenticator.authenticate({
			token: registration.authToken,
			sourceId,
			// Loopback is the only transport in v1; encryption for remote peers is Phase 4a.
			loopback: true,
		});
		if (!auth.ok) {
			return this.refuse(ws, `refused a worker for source "${sourceId}": ${auth.reason}`);
		}

		// D#64 / T-03: without a per-source cap one registrant could absorb every step.
		const liveForSource = this.registry.countForSource(sourceId);
		if (liveForSource >= source.maxWorkers) {
			return this.refuse(
				ws,
				`refused a worker for source "${sourceId}": it already has ${String(liveForSource)} of ${String(source.maxWorkers)} allowed workers connected. Raise maxWorkers on the source to allow more.`
			);
		}

		this.registry.register(ws, registration, { ephemeral: false });
		return true;
	}

	private refuse(ws: WebSocket, reason: string): false {
		process.stderr.write(`[WorkerProvisioner] ${reason}\n`);
		ws.terminate();
		return false;
	}
}
