import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import type { DaemonToSource, SourceToDaemon } from '../ipc/Protocol';
import type { RegisteredHost } from './HostRegistry.js';

/** How long a host has to answer before the daemon gives up on it. */
const DEFAULT_HOST_TIMEOUT_MS = 10_000;

export interface HostWorkerSourceOptions {
	/**
	 * Bound on the wait for a host's answer.
	 *
	 * Not a bound on the worker appearing -- nothing waits for that (D#4, D#66). This only
	 * stops one unresponsive machine from holding up provisioning for everyone else.
	 */
	timeoutMs?: number;
}

/**
 * S1 for a remote host: asks a machine that is already connected to produce a worker.
 *
 * This is the daemon-side half that D#52 and D#53 require. The *creation mechanism* lives on
 * the host (D#20) -- this only carries the ask, through S1's single method, so contact-or-create
 * stays entirely the plugin's business.
 *
 * What travels is demand and nothing else: how many, for which projects, with which labels.
 * No command, no script, no path (D#19). That is what contains T-13: a compromised daemon can
 * inflate demand, bounded by each host's own declared capacity, but it cannot make a host run
 * something of the daemon's choosing.
 *
 * Resolving means the host accepted the ask, not that a worker exists. Only a live connection
 * proves that (D#4), and the caller bounds its own wait separately (S8).
 */
export class HostWorkerSource implements WorkerSourceProvider {
	private readonly timeoutMs: number;

	constructor(
		private readonly findHost: (sourceId: string) => RegisteredHost | undefined,
		options: HostWorkerSourceOptions = {}
	) {
		this.timeoutMs = options.timeoutMs ?? DEFAULT_HOST_TIMEOUT_MS;
	}

	async obtainWorker(request: WorkerRequest): Promise<void> {
		const host = this.findHost(request.sourceId);
		if (host === undefined) {
			throw new Error(
				`source "${request.sourceId}" has no host connected, so it cannot be asked for a worker. A host dials the daemon itself -- start it on that machine and check it registered with "flow worker source list".`
			);
		}

		const requestId = randomUUID();
		const demand: DaemonToSource = {
			type: 'provide_worker',
			requestId,
			projects: request.projects,
			labels: [],
		};

		const answer = await this.askHost(host.ws, requestId, demand, request.sourceId);
		if (!answer.accepted) {
			const because = answer.reason === undefined || answer.reason === '' ? 'it gave no reason' : answer.reason;
			throw new Error(`source "${request.sourceId}" declined to provide a worker: ${because}`);
		}
	}

	/**
	 * Sends the ask and waits for the matching answer.
	 *
	 * Answers are matched on `requestId` and anything else is ignored rather than treated as a
	 * reply: a host serving several asks at once will interleave them, and taking the first
	 * message to arrive would attribute one ask's refusal to another.
	 */
	private askHost(
		ws: WebSocket,
		requestId: string,
		demand: DaemonToSource,
		sourceId: string
	): Promise<{ accepted: boolean; reason?: string }> {
		return new Promise((resolve, reject) => {
			const onMessage = (data: Buffer): void => {
				let message: SourceToDaemon;
				try {
					message = JSON.parse(data.toString()) as SourceToDaemon;
				} catch {
					// Not an answer to anything; a malformed frame is the listener's business.
					return;
				}
				if (message.type !== 'provide_worker_ack' || message.requestId !== requestId) return;
				settle(() => {
					resolve({
						accepted: message.accepted,
						...(message.reason !== undefined ? { reason: message.reason } : {}),
					});
				});
			};

			const timer = setTimeout(() => {
				settle(() => {
					reject(
						new Error(
							`source "${sourceId}" did not answer within ${String(this.timeoutMs)} ms. The host is connected but unresponsive; the daemon stopped waiting rather than holding up the queue.`
						)
					);
				});
			}, this.timeoutMs);

			/** Removes the listener exactly once, so a late answer cannot resolve twice. */
			const settle = (finish: () => void): void => {
				clearTimeout(timer);
				ws.off('message', onMessage);
				finish();
			};

			ws.on('message', onMessage);
			try {
				ws.send(JSON.stringify(demand));
			} catch (err) {
				settle(() => {
					reject(err instanceof Error ? err : new Error(String(err)));
				});
			}
		});
	}
}
