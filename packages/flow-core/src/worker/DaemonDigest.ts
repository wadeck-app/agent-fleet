import { START_DAEMON_ADVICE } from './WorkerListing.js';
import type { DaemonStatus } from './WorkerListing.js';
import type { WorkerSummary } from './WorkerSummary.js';

/** Badge variants used for the daemon and the workers. */
export type DaemonDigestVariant = 'success' | 'danger' | 'info' | 'warning' | 'default';

/** The daemon and its workers in a few short strings for a narrow dashboard card. */
export interface DaemonDigest {
	daemonLabel: string;
	daemonVariant: DaemonDigestVariant;
	workersLabel: string;
	workersVariant: DaemonDigestVariant;
	/** What to know or do next, one sentence. */
	hint: string;
}

/** Summary of `FlowQueryService.listWorkers()`: the daemon state and the number of live workers. */
export function summarizeDaemon(listing: { workers: readonly WorkerSummary[]; daemon: DaemonStatus }): DaemonDigest {
	const { workers, daemon } = listing;
	if (!daemon.running) {
		return {
			daemonLabel: 'Daemon stopped',
			daemonVariant: 'danger',
			workersLabel: 'No worker',
			workersVariant: 'default',
			// The reason (a port file path) is for the logs and `flow worker list`: it would overflow a narrow card.
			hint: `Daemon is not running: ${START_DAEMON_ADVICE}.`,
		};
	}
	if (workers.length === 0) {
		return {
			daemonLabel: 'Daemon running',
			daemonVariant: 'success',
			workersLabel: 'No worker',
			workersVariant: 'warning',
			hint: 'The daemon holds no worker connection: open Workers to see the declared sources.',
		};
	}
	const busy = workers.filter(worker => worker.state === 'busy').length;
	return {
		daemonLabel: 'Daemon running',
		daemonVariant: 'success',
		workersLabel: workers.length === 1 ? '1 worker' : `${workers.length} workers`,
		workersVariant: 'info',
		hint: `${busy} busy, ${workers.length - busy} idle`,
	};
}
