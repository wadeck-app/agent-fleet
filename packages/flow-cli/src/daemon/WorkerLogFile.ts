import { isWorkerLogFileName, workerLogFileName } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { WorkerLog } from './ForkWorkerSource.js';

/** The file never grows past this; when it does, the oldest half is dropped (so it holds 0.5 to 1 MiB of the latest output). */
export const WORKER_LOG_MAX_BYTES = 1024 * 1024;
/** Files not written for this long are deleted at daemon start. */
export const WORKER_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** The short tag written in front of each line. */
const STREAM_LABEL = { stdout: 'out', stderr: 'err' } as const;

export type WorkerStream = keyof typeof STREAM_LABEL;

export interface WorkerLogFileOptions {
	maxBytes?: number;
	now?: () => Date;
}

/**
 * The captured output of one forked worker: `<dir>/worker-<pid>.log`, one line per output line as
 * `<ISO time> <out|err> <masked text>`.
 *
 * Chunks are cut into lines before masking (a secret split across two chunks would escape a per-chunk masker), and every
 * line goes through `mask` -- the same masking as the stderr tail the daemon logs on exit. A line still open at `close`
 * is flushed. The file is opened fresh (truncated) by a new worker of the same pid.
 *
 * Failures are reported once through `log` and then the file stops writing: the worker is never affected.
 */
export class WorkerLogFile {
	readonly filePath: string;
	private readonly partial: Record<WorkerStream, string> = { stdout: '', stderr: '' };
	private readonly maxBytes: number;
	private readonly now: () => Date;
	private size = 0;
	private failed = false;

	constructor(
		dir: string,
		private readonly pid: number,
		private readonly mask: (text: string) => string,
		private readonly log: WorkerLog,
		options: WorkerLogFileOptions = {}
	) {
		this.filePath = path.join(dir, workerLogFileName(pid));
		this.maxBytes = options.maxBytes ?? WORKER_LOG_MAX_BYTES;
		this.now = options.now ?? (() => new Date());
		try {
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(this.filePath, '', 'utf8');
		} catch (err) {
			this.fail('open', err);
		}
	}

	/** Takes a chunk of one stream; complete lines are written, the rest waits for its newline. */
	append(stream: WorkerStream, chunk: string): void {
		const parts = (this.partial[stream] + chunk.replace(/\r\n/g, '\n')).split('\n');
		this.partial[stream] = parts.pop() ?? '';
		this.write(stream, parts);
	}

	/** Flushes the lines still open (a worker that died mid-line). */
	close(): void {
		for (const stream of ['stdout', 'stderr'] as const) {
			const rest = this.partial[stream];
			this.partial[stream] = '';
			if (rest !== '') {
				this.write(stream, [rest]);
			}
		}
	}

	private write(stream: WorkerStream, lines: string[]): void {
		if (this.failed || lines.length === 0) {
			return;
		}
		const time = this.now().toISOString();
		const text = lines.map(line => `${time} ${STREAM_LABEL[stream]} ${this.mask(line)}\n`).join('');
		try {
			fs.appendFileSync(this.filePath, text, 'utf8');
			this.size += Buffer.byteLength(text);
			if (this.size > this.maxBytes) {
				this.dropOldestHalf();
			}
		} catch (err) {
			this.fail('write', err);
		}
	}

	/** Keeps the newest half of the bytes, starting at a line boundary. */
	private dropOldestHalf(): void {
		const content = fs.readFileSync(this.filePath);
		const tail = content.subarray(content.length - Math.floor(this.maxBytes / 2));
		const firstNewline = tail.indexOf(0x0a);
		const kept = firstNewline === -1 ? tail : tail.subarray(firstNewline + 1);
		fs.writeFileSync(this.filePath, kept);
		this.size = kept.length;
	}

	private fail(action: string, err: unknown): void {
		this.failed = true;
		this.log(
			'error',
			`worker pid ${String(this.pid)}: cannot ${action} its output file ${this.filePath}, its output will not be captured: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/**
 * Deletes the worker log files not written for `maxAgeMs`. Run at daemon start: workers of a previous daemon are gone,
 * and their files are all that explains how they ended. A missing directory is normal (nothing was ever captured);
 * anything else is logged and the cleanup stops, never thrown: it must not keep the daemon from starting.
 */
export function pruneWorkerLogs(
	dir: string,
	log: WorkerLog,
	maxAgeMs: number = WORKER_LOG_RETENTION_MS,
	now: number = Date.now()
): void {
	let names: string[];
	try {
		names = fs.readdirSync(dir).filter(isWorkerLogFileName);
	} catch (err) {
		if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
			log('error', `cannot list worker logs in ${dir} for the retention cleanup: ${String(err)}`);
		}
		return;
	}
	for (const name of names) {
		const file = path.join(dir, name);
		try {
			if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
				fs.unlinkSync(file);
			}
		} catch (err) {
			log('error', `cannot remove the old worker log ${file}: ${String(err)}`);
		}
	}
}
