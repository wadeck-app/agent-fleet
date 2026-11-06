import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { sendNudge } from './NudgeDispatch.js';

/**
 * A source whose workers are already running and dial the daemon themselves.
 *
 * When the entry carries a `nudgeUrl`, `obtainWorker` sends a single HTTP POST to it,
 * delivering the daemon's WS address so the worker can connect immediately rather than
 * waiting for its backoff timer. The nudge is best-effort: a failure is reported and
 * ignored, because the worker reconnects via backoff regardless (D#4, D#66).
 *
 * Without a `nudgeUrl` there is no channel to the worker, which is the whole point of
 * an inbound source: trust originates from the worker choosing to present itself (D#18).
 */
export class InboundWorkerSource implements WorkerSourceProvider {
	constructor(private readonly nudgeUrl?: string) {}

	async obtainWorker(request: WorkerRequest): Promise<void> {
		if (this.nudgeUrl === undefined) return;
		try {
			await sendNudge(this.nudgeUrl, request.daemonEndpoint);
		} catch (err) {
			// Not fatal: the worker reconnects via backoff. Throw so the caller can log it.
			throw new Error(
				`nudge to "${request.sourceId}" at ${this.nudgeUrl} failed: ${normalizeError(err).message}`
			);
		}
	}
}
