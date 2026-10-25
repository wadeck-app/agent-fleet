import { executionsDirOf, logFilePath, todayLogDate } from 'flow-core';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { findLiveDaemon } from '../../daemon/LiveDaemonProbe';
import type { ExecutionState } from '../../ipc/Protocol';
import { ExecutionStore } from '../../storage/ExecutionStore';
import { tailLogFile } from './ExecutionLogTail';

// violations-suppress-end: ts/no-deep-relative

export class ExecutionTimeoutError extends Error {}

/** The daemon running the execution stopped before the execution finished; waiting longer cannot change that. */
export class DaemonStoppedError extends Error {
	constructor(executionId: string) {
		super(
			`The flow daemon stopped before execution ${executionId} finished, so it will never complete (its record stays "running" until the next daemon starts and marks it failed). ` +
				`Re-run it with: flow run, or check why the daemon stopped with: flow logs`
		);
		this.name = 'DaemonStoppedError';
	}
}

/** How often the waiter asks whether the daemon is still there (not on every poll: a probe is a TCP connect). */
const DAEMON_CHECK_INTERVAL_MS = 5_000;

export interface WaitOptions {
	fastPoll?: boolean;
	/** Whether a daemon still answers for `daemonDir`. Defaults to the published port file plus a connect. */
	isDaemonAlive?: () => Promise<boolean>;
	daemonCheckIntervalMs?: number;
}

export async function waitForCompletion(
	executionId: string,
	daemonDir: string,
	timeoutMs: number,
	onLog?: (stepId: string, message: string) => void,
	options?: WaitOptions
): Promise<ExecutionState> {
	const store = new ExecutionStore(executionsDirOf(daemonDir));
	const logFile = logFilePath(daemonDir, todayLogDate());
	const isDaemonAlive = options?.isDaemonAlive ?? (async () => (await findLiveDaemon(daemonDir)) !== null);
	const daemonCheckIntervalMs = options?.daemonCheckIntervalMs ?? DAEMON_CHECK_INTERVAL_MS;
	const deadline = Date.now() + timeoutMs;
	// fastPoll: fixed 50ms (streaming/polling log modes). Normal: starts 200ms, grows to 2000ms.
	let delay = options?.fastPoll ? 50 : 200;
	let lastByte = 0;
	let nextDaemonCheck = Date.now() + daemonCheckIntervalMs;
	let missedDaemonChecks = 0;
	while (Date.now() < deadline) {
		if (onLog) {
			lastByte = tailLogFile(logFile, executionId, lastByte, onLog);
		}
		// Only read once the file exists -- avoids swallowing real I/O errors (disk-full, bad JSON)
		// by conflating them with the normal "not yet written" case.
		if (store.exists(executionId)) {
			const state = store.read(executionId);
			if (state.status === 'completed' || state.status === 'failed') {
				if (onLog) {
					tailLogFile(logFile, executionId, lastByte, onLog);
				}
				return state;
			}
		}
		if (Date.now() >= nextDaemonCheck) {
			nextDaemonCheck = Date.now() + daemonCheckIntervalMs;
			missedDaemonChecks = (await isDaemonAlive()) ? 0 : missedDaemonChecks + 1;
			// Two misses in a row: a daemon restarting is briefly unreachable, a dead one stays so. The record is read
			// once more first, because a daemon that finished the execution may idle-stop right after.
			if (missedDaemonChecks >= 2) {
				if (store.exists(executionId)) {
					const last = store.read(executionId);
					if (last.status === 'completed' || last.status === 'failed') {
						return last;
					}
				}
				throw new DaemonStoppedError(executionId);
			}
		}
		await new Promise(r => setTimeout(r, delay));
		if (!options?.fastPoll) {
			delay = Math.min(delay * 1.5, 2000);
		}
	}
	throw new ExecutionTimeoutError(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}
