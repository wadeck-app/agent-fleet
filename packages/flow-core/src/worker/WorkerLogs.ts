import * as fs from 'node:fs';
import * as path from 'node:path';

import { logsDirOf } from '../config/FlowConfigLayout.js';
import { FlowCoreError } from '../errors.js';
import type { WorkerSummary } from './WorkerSummary.js';

/** Lines returned when the caller does not say. */
export const WORKER_LOG_DEFAULT_LINES = 200;
/** Hard upper bound of one answer: the file itself is capped by the writer, this caps what a page carries. */
export const WORKER_LOG_MAX_LINES = 2000;
/** Most files the "recent workers" listing returns (newest first). */
export const RECENT_WORKER_LOG_LIMIT = 50;
/** Longest "last line" hint, in characters. */
const LAST_LINE_MAX_CHARS = 200;
/** How much of the end of a file is read to find its last line. */
const LAST_LINE_PROBE_BYTES = 4096;

/**
 * A log key: what is between `worker-` and `.log`. Either a pid (a worker the daemon forked) or a worker id (any other
 * worker, once it connected). Restricted to what cannot escape the directory: a key comes from a URL.
 */
const WORKER_LOG_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/;
const WORKER_LOG_FILE_RE = /^worker-([A-Za-z0-9][A-Za-z0-9-]{0,99})\.log$/;

/** Where a worker came from, as shown to the user. */
export type WorkerOrigin = 'started by the daemon' | 'external';

/** No worker has this id (not connected) and no log file exists under this key. */
export class UnknownWorkerError extends FlowCoreError {
	constructor(readonly workerId: string) {
		super(
			`Worker ${workerId} is not connected and no log of it was found. It may have exited long ago (logs are kept 7 days), or the id is wrong: see the list of workers.`,
			'unknown-worker'
		);
	}
}

/** Where the daemon keeps the logs of the workers: one file per worker process (forked) or per worker id (any other). */
export function workerLogsDirOf(configDir: string): string {
	return path.join(logsDirOf(configDir), 'workers');
}

/** Whether `key` is a well-formed log key (see {@link WORKER_LOG_KEY_RE}). */
export function isWorkerLogKey(key: string): boolean {
	return WORKER_LOG_KEY_RE.test(key);
}

/** The file of a log key. Throws on a malformed key: it must never reach the file system. */
export function workerLogFileNameOfKey(key: string): string {
	if (!isWorkerLogKey(key)) {
		throw new FlowCoreError(
			`Invalid worker log key '${key}': expected letters, digits and '-' only (a pid or a worker id).`,
			'invalid-query'
		);
	}
	return `worker-${key}.log`;
}

/**
 * The file of a forked worker. It is keyed by pid, the only identity known at spawn time: the workerId is assigned when
 * the worker connects back. A live worker reports its pid, so `WorkerSummary.pid` maps a worker to its file; a respawn
 * with the same pid truncates the file (the writer opens it fresh).
 */
export function workerLogFileName(pid: number): string {
	return workerLogFileNameOfKey(String(pid));
}

/**
 * The file of a worker the daemon did not fork (external, relayed, sandbox): keyed by the worker id the daemon assigned
 * at registration, the only identity such a worker has (its pid means nothing to the daemon).
 */
export function workerLogFileNameOfWorkerId(workerId: string): string {
	return workerLogFileNameOfKey(workerId);
}

/** The key of a worker's log: its pid when the daemon forked it, its worker id otherwise. */
export function workerLogKeyOf(worker: Pick<WorkerSummary, 'workerId' | 'pid' | 'ephemeral'>): string {
	return worker.ephemeral ? String(worker.pid) : worker.workerId;
}

/** The key inside a worker log file name, or undefined for a file the writer does not own. */
export function workerLogKeyOfFileName(fileName: string): string | undefined {
	return WORKER_LOG_FILE_RE.exec(fileName)?.[1];
}

/** Whether `fileName` is a file the worker log writer owns (what retention may delete). */
export function isWorkerLogFileName(fileName: string): boolean {
	return WORKER_LOG_FILE_RE.test(fileName);
}

/** A pid key is a forked worker; any other key is a worker id. */
export function originOfWorkerLogKey(key: string): WorkerOrigin {
	return /^\d+$/.test(key) ? 'started by the daemon' : 'external';
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
	/** Size of the file in bytes; 0 when unavailable. */
	sizeBytes: number;
	/** When the file was last written (ISO); absent when unavailable. */
	modifiedAt?: string;
}

/** One log file of a worker, as listed under "recent workers". */
export interface RecentWorkerLog {
	/** The id the page and the route use for it (a pid or a worker id). */
	key: string;
	origin: WorkerOrigin;
	/** Only for a worker the daemon forked. */
	pid?: number;
	sizeBytes: number;
	/** ISO time of the last write. */
	modifiedAt: string;
	/** The last line of the file (time, stream, text), cut to 200 characters; '' for an empty file. */
	lastLine: string;
}

function isMissing(err: unknown): boolean {
	return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

function assertLines(lines: number): void {
	if (!Number.isInteger(lines) || lines < 1 || lines > WORKER_LOG_MAX_LINES) {
		throw new FlowCoreError(
			`Invalid lines '${String(lines)}': expected an integer between 1 and ${String(WORKER_LOG_MAX_LINES)}.`,
			'invalid-query'
		);
	}
}

/** Tail of one file. A missing file is `missingReason` (a normal answer); any other read failure throws. */
function readTail(filePath: string, workerId: string, lines: number, missingReason: string): WorkerLogsView {
	let content: string;
	let stat: fs.Stats;
	try {
		content = fs.readFileSync(filePath, 'utf8');
		stat = fs.statSync(filePath);
	} catch (err) {
		if (isMissing(err)) {
			return {
				workerId,
				available: false,
				reason: missingReason,
				lines: [],
				truncated: false,
				filePath,
				sizeBytes: 0,
			};
		}
		throw err;
	}
	const all = content.split('\n');
	// A terminal newline leaves one empty trailing element: not a line.
	if (all[all.length - 1] === '') {
		all.pop();
	}
	return {
		workerId,
		available: true,
		lines: all.slice(-lines),
		truncated: all.length > lines,
		filePath,
		sizeBytes: stat.size,
		modifiedAt: stat.mtime.toISOString(),
	};
}

/**
 * The tail of the log of one live worker: the process output of a worker the daemon forked (`worker-<pid>.log`), or what
 * the daemon observed of (and the worker shipped from) any other worker (`worker-<workerId>.log`). A missing file is a
 * normal answer, not an error (retention, or a daemon that predates the capture); any other read failure throws.
 */
export function readWorkerLogs(
	configDir: string,
	worker: Pick<WorkerSummary, 'workerId' | 'pid' | 'ephemeral' | 'version'>,
	lines: number
): WorkerLogsView {
	assertLines(lines);
	const filePath = path.join(workerLogsDirOf(configDir), workerLogFileNameOfKey(workerLogKeyOf(worker)));
	const version = worker.version === undefined ? 'unknown version' : worker.version;
	return readTail(
		filePath,
		worker.workerId,
		lines,
		worker.ephemeral
			? `No log file for this worker at ${filePath}: it was removed by the retention cleanup, or the daemon that started the worker predates the capture of worker output (restart the daemon to enable it).`
			: `No log file for this worker (version ${version}) at ${filePath}: it was removed by the retention cleanup, or the daemon predates the per-worker logs (restart the daemon to enable them).`
	);
}

/**
 * The tail of the log under `key`, for a worker that is no longer connected (or when no daemon runs): read straight from
 * the file, like the daemon log. Undefined when the key is malformed or no such file exists.
 */
export function readWorkerLogByKey(configDir: string, key: string, lines: number): WorkerLogsView | undefined {
	assertLines(lines);
	if (!isWorkerLogKey(key)) {
		return undefined;
	}
	const filePath = path.join(workerLogsDirOf(configDir), workerLogFileNameOfKey(key));
	const view = readTail(filePath, key, lines, '');
	return view.available ? view : undefined;
}

function lastLineOf(filePath: string, sizeBytes: number): string {
	if (sizeBytes === 0) {
		return '';
	}
	const fd = fs.openSync(filePath, 'r');
	try {
		const length = Math.min(sizeBytes, LAST_LINE_PROBE_BYTES);
		const buffer = Buffer.alloc(length);
		fs.readSync(fd, buffer, 0, length, sizeBytes - length);
		const last = buffer
			.toString('utf8')
			.split('\n')
			.filter(line => line !== '')
			.pop();
		return (last ?? '').slice(0, LAST_LINE_MAX_CHARS);
	} finally {
		fs.closeSync(fd);
	}
}

/**
 * The worker log files on disk, newest first, minus `excludeKeys` (the workers that are live: they have their own table).
 * Only regular files the writer owns are listed (a directory is skipped: it has a size on some file systems). A missing
 * directory is normal (nothing was ever captured); a file that vanishes while listing is skipped.
 */
export function listRecentWorkerLogs(
	configDir: string,
	excludeKeys: ReadonlySet<string> = new Set(),
	limit: number = RECENT_WORKER_LOG_LIMIT
): RecentWorkerLog[] {
	const dir = workerLogsDirOf(configDir);
	let names: string[];
	try {
		names = fs.readdirSync(dir);
	} catch (err) {
		if (isMissing(err)) {
			return [];
		}
		throw err;
	}
	const found: (RecentWorkerLog & { mtimeMs: number })[] = [];
	for (const name of names) {
		const key = workerLogKeyOfFileName(name);
		if (key === undefined || excludeKeys.has(key)) {
			continue;
		}
		const filePath = path.join(dir, name);
		try {
			const stat = fs.statSync(filePath);
			if (!stat.isFile()) {
				continue;
			}
			found.push({
				key,
				origin: originOfWorkerLogKey(key),
				...(/^\d+$/.test(key) ? { pid: Number(key) } : {}),
				sizeBytes: stat.size,
				modifiedAt: stat.mtime.toISOString(),
				lastLine: lastLineOf(filePath, stat.size),
				mtimeMs: stat.mtimeMs,
			});
		} catch (err) {
			if (!isMissing(err)) {
				throw err;
			}
		}
	}
	found.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return found.slice(0, limit).map(({ mtimeMs: _mtimeMs, ...entry }) => entry);
}
