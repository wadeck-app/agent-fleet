import * as fs from 'node:fs';
import * as path from 'node:path';

import { logsDirOf } from '../config/FlowConfigLayout.js';
import { FlowCoreError } from '../errors.js';
import type { WorkerSummary } from './WorkerSummary.js';

/** Lines returned when the caller does not say. */
export const WORKER_LOG_DEFAULT_LINES = 200;
/** Hard upper bound of one answer: the file itself is capped by the writer, this caps what a page carries. */
export const WORKER_LOG_MAX_LINES = 2000;

const WORKER_LOG_FILE_RE = /^worker-\d+\.log$/;

/** No connected worker has this id (it may have exited: only live workers are listed). */
export class UnknownWorkerError extends FlowCoreError {
	constructor(readonly workerId: string) {
		super(
			`Worker ${workerId} is not connected. It may have exited, or the id is wrong: see the list of live workers.`,
			'unknown-worker'
		);
	}
}

/** Where the daemon captures the output of the workers it forks: one file per worker process. */
export function workerLogsDirOf(configDir: string): string {
	return path.join(logsDirOf(configDir), 'workers');
}

/**
 * The file of a forked worker. It is keyed by pid, the only identity known at spawn time: the workerId is assigned when
 * the worker connects back. A live worker reports its pid, so `WorkerSummary.pid` maps a worker to its file; a respawn
 * with the same pid truncates the file (the writer opens it fresh).
 */
export function workerLogFileName(pid: number): string {
	return `worker-${String(pid)}.log`;
}

/** Whether `fileName` is a file the worker log writer owns (what retention may delete). */
export function isWorkerLogFileName(fileName: string): boolean {
	return WORKER_LOG_FILE_RE.test(fileName);
}

export interface WorkerLogsView {
	workerId: string;
	/** False when there is no log to show: `reason` says why and what to do. */
	available: boolean;
	reason?: string;
	/** The last lines of the file (oldest first), at most the requested number. Empty when unavailable. */
	lines: string[];
	/** True when the file holds more lines than were returned (or the writer already dropped older output). */
	truncated: boolean;
	/** Where the file is (or would be); useful to open it directly. */
	filePath: string;
}

/**
 * The tail of the log of one live worker. Only workers this daemon forked have a file (`ephemeral`): an external or
 * relayed worker runs elsewhere and its output never reaches the daemon. A missing file for a forked worker (removed by
 * the retention, or the daemon predates the capture) is a normal answer, not an error; any other read failure throws.
 */
export function readWorkerLogs(
	configDir: string,
	worker: Pick<WorkerSummary, 'workerId' | 'pid' | 'ephemeral'>,
	lines: number
): WorkerLogsView {
	if (!Number.isInteger(lines) || lines < 1 || lines > WORKER_LOG_MAX_LINES) {
		throw new FlowCoreError(
			`Invalid lines '${String(lines)}': expected an integer between 1 and ${String(WORKER_LOG_MAX_LINES)}.`,
			'invalid-query'
		);
	}
	const filePath = path.join(workerLogsDirOf(configDir), workerLogFileName(worker.pid));
	const unavailable = (reason: string): WorkerLogsView => ({
		workerId: worker.workerId,
		available: false,
		reason,
		lines: [],
		truncated: false,
		filePath,
	});

	if (!worker.ephemeral) {
		return unavailable(
			'This worker was not started by the daemon (external or relayed): its output stays on the machine where it runs, the daemon does not capture it.'
		);
	}
	let content: string;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return unavailable(
				`No log file for this worker at ${filePath}: it was removed by the retention cleanup, or the daemon that started the worker predates the capture of worker output (restart the daemon to enable it).`
			);
		}
		throw err;
	}
	const all = content.split('\n');
	// A terminal newline leaves one empty trailing element: not a line.
	if (all[all.length - 1] === '') {
		all.pop();
	}
	return {
		workerId: worker.workerId,
		available: true,
		lines: all.slice(-lines),
		truncated: all.length > lines,
		filePath,
	};
}
