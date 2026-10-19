import { DaemonNotRunningError, readPortFile } from '@wadeck-app/singleton-daemon-kit';

import {
	createRemoteDaemonClient,
	isUnknownCommandError,
	outdatedDaemonMessage,
} from '../daemon/RemoteDaemonClient.js';
import { FlowCoreError, errorMessage } from '../errors.js';
import type { DaemonStatus } from './WorkerListing.js';
import type { WorkerSummary } from './WorkerSummary.js';

export type WorkerListErrorKind = 'daemon-outdated' | 'daemon-error';

/** The daemon answered, but not with a worker list. The message is already actionable. */
export class WorkerListError extends FlowCoreError {
	constructor(
		message: string,
		override readonly kind: WorkerListErrorKind
	) {
		super(message, kind);
	}
}

export interface WorkerListSnapshot {
	workers: WorkerSummary[];
	daemon: DaemonStatus;
}

/** One formatted text line for a worker, as printed by `flow worker list` without `--json`. */
export function formatWorkerLine(w: WorkerSummary): string {
	const labels = w.labels.length > 0 ? w.labels.join(',') : '-';
	const shells = w.shellCapabilities && w.shellCapabilities.length > 0 ? w.shellCapabilities.join(',') : '-';
	const origin = w.ephemeral ? 'daemon-forked' : (w.sourceId ?? 'external');
	return `${w.workerId}\t${w.state}\tpid=${String(w.pid)}\tversion=${w.version ?? '-'}\t${origin}\tlabels=${labels}\tshells=${shells}\tinteractive=${String(w.hasUserInterface)}`;
}

/**
 * The identity of the daemon that just answered, read only when `needed` (the only case that
 * prints it). The port file is advisory here: the daemon answered, so an unreadable file
 * degrades to "details unavailable" in the output rather than failing the listing.
 */
export async function describeRunningDaemon(daemonDir: string, needed: boolean): Promise<DaemonStatus> {
	const unknown: DaemonStatus = { running: true, pid: undefined, port: undefined, startedAt: undefined };
	if (!needed) {
		return unknown;
	}
	try {
		const data = await readPortFile(daemonDir);
		if (data) {
			return { running: true, pid: data.pid, port: data.port, startedAt: data.startedAt };
		}
	} catch {
		// Falls through to the "details unavailable" status.
	}
	return unknown;
}

/**
 * Reads the live worker list once, without printing anything.
 *
 * `DaemonNotRunningError` is reported as an empty list, not a failure: no daemon simply means no
 * live workers. Any other error is thrown as a {@link WorkerListError}; the most common is an
 * outdated daemon that predates the command.
 */
export async function readWorkerList(daemonDir: string): Promise<WorkerListSnapshot> {
	try {
		// Declared optional: the client has no local implementation (see createRemoteDaemonClient).
		const client = createRemoteDaemonClient<{ workers?: () => Promise<WorkerSummary[]> }>(daemonDir);
		const workers = (await client.send('workers', undefined)) as WorkerSummary[];
		return { workers, daemon: await describeRunningDaemon(daemonDir, workers.length === 0) };
	} catch (err) {
		if (err instanceof DaemonNotRunningError) {
			return { workers: [], daemon: { running: false, reason: errorMessage(err) } };
		}
		const message = errorMessage(err);
		if (isUnknownCommandError(message)) {
			throw new WorkerListError(outdatedDaemonMessage('flow worker list'), 'daemon-outdated');
		}
		throw new WorkerListError(message, 'daemon-error');
	}
}
