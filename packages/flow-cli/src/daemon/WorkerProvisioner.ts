import type { WebSocket } from 'ws';

import type { WorkerReady } from '../ipc/Protocol';
import type { ForkWorkerSource } from './ForkWorkerSource.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

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
		private readonly forkSource: ForkWorkerSource
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
		if (!this.forkSource.hasSpawned(registration.pid)) {
			process.stderr.write(
				`[WorkerProvisioner] refused registration from pid ${String(registration.pid)}: not spawned by this daemon, and worker authentication is not available yet\n`
			);
			ws.terminate();
			return false;
		}
		this.forkSource.acknowledgeConnection(registration.pid);
		this.registry.register(ws, registration);
		return true;
	}
}
