import type { WebSocket } from 'ws';

import { WORKER_FEATURE_WORKER_LOGS, type WorkerToDaemon } from '../ipc/Protocol';
import { MASKING_FAILED } from '../secrets/SecretMasker.js';
import type { WorkerLog } from './ForkWorkerSource.js';
import { WorkerLogFile } from './WorkerLogFile.js';

/** What one worker may add to its log per second: the rest is dropped and counted (a runaway worker must not cost the daemon its disk and time). */
export const WORKER_LOG_MAX_BYTES_PER_SECOND = 128 * 1024;
/** The most characters of one `worker_log` message that are kept; a well-behaved worker sends at most 16 KiB. */
export const WORKER_LOG_MESSAGE_MAX_CHARS = 64 * 1024;

/** The registration facts the log header needs (a subset of the registry's `RegisteredWorker`). */
export interface LoggedWorker {
	workerId: string;
	pid: number;
	version?: string;
	sourceId?: string;
	labels: string[];
	features: string[];
	ephemeral: boolean;
}

interface Connection {
	file: WorkerLogFile;
	/** The worker declared the feature and was told it may ship. */
	shipping: boolean;
	windowStartMs: number;
	windowBytes: number;
	/** Characters dropped by the volume cap since the last marker written. */
	dropped: number;
	complained: boolean;
}

export interface WorkerConnectionLogsOptions {
	maxBytesPerSecond?: number;
	now?: () => number;
}

/**
 * The log of every worker the daemon did NOT fork (external, relayed, sandbox): `worker-<workerId>.log`, one per
 * connection. Two producers write to it:
 *
 * - the daemon, for what it observes of ANY such worker, old or new (connected, step started, completed or failed,
 *   disconnected with the close code): this is what makes the log exist for a worker that ships nothing;
 * - the worker itself, through `worker_log`, once the daemon enabled it (the worker declared
 *   {@link WORKER_FEATURE_WORKER_LOGS}): its own printed output.
 *
 * A forked worker is not handled here: its process output is captured by `ForkWorkerSource` into `worker-<pid>.log`.
 * Everything is masked (same masker as the fork capture) and capped (bytes per second here, 1 MiB per file in
 * {@link WorkerLogFile}); a failing file is reported once and never affects the worker.
 */
export class WorkerConnectionLogs {
	private readonly connections = new Map<WebSocket, Connection>();
	private readonly maxBytesPerSecond: number;
	private readonly now: () => number;

	constructor(
		private readonly dir: string,
		private readonly mask: (text: string) => string,
		private readonly log: WorkerLog,
		options: WorkerConnectionLogsOptions = {}
	) {
		this.maxBytesPerSecond = options.maxBytesPerSecond ?? WORKER_LOG_MAX_BYTES_PER_SECOND;
		this.now = options.now ?? Date.now;
	}

	/**
	 * Starts the log of a worker on its first `ready` (the later ones, after each step, are no-ops).
	 * @returns true when the worker must now be told it may ship its output (once per connection).
	 */
	open(ws: WebSocket, worker: LoggedWorker): boolean {
		if (worker.ephemeral || this.connections.has(ws)) {
			return false;
		}
		const shipping = worker.features.includes(WORKER_FEATURE_WORKER_LOGS);
		let file: WorkerLogFile;
		try {
			file = new WorkerLogFile(this.dir, worker.workerId, text => this.safeMask(text), this.log);
		} catch (err) {
			// A worker id that cannot be a file name is a daemon bug: say it, the worker is unaffected.
			this.log('error', `worker ${worker.workerId}: cannot start its log: ${String(err)}`);
			return false;
		}
		this.connections.set(ws, {
			file,
			shipping,
			windowStartMs: this.now(),
			windowBytes: 0,
			dropped: 0,
			complained: false,
		});
		const labels = worker.labels.length > 0 ? worker.labels.join(',') : '-';
		this.note(
			ws,
			`connected: worker ${worker.workerId}, pid ${String(worker.pid)}, version ${worker.version ?? 'unknown'}, source ${worker.sourceId ?? '-'}, labels ${labels}`
		);
		this.note(
			ws,
			shipping
				? 'this worker ships its own output: its lines follow, tagged out (stdout) and err (stderr)'
				: `this worker (version ${worker.version ?? 'unknown'}) does not ship its own output (it does not declare '${WORKER_FEATURE_WORKER_LOGS}'): this log has only what the daemon observed. Update the worker (flow cli update) and restart it to get its output here.`
		);
		return shipping;
	}

	/** One line of what the daemon observed. No-op for a connection that has no log (forked, or never registered). */
	note(ws: WebSocket, text: string): void {
		this.connections.get(ws)?.file.append('daemon', `${text}\n`);
	}

	/** The worker's own output. Dropped (and said once in the daemon log) when the worker was not told it may ship. */
	ship(ws: WebSocket, message: Extract<WorkerToDaemon, { type: 'worker_log' }>): void {
		const connection = this.connections.get(ws);
		if (connection === undefined || !connection.shipping) {
			this.complainOnce(
				connection,
				'sent worker_log without having been enabled (it did not declare the feature, or it is a worker this daemon forked); ignored'
			);
			return;
		}
		if (
			(message.stream !== 'stdout' && message.stream !== 'stderr') ||
			typeof message.text !== 'string' ||
			(message.dropped !== undefined && !Number.isFinite(message.dropped))
		) {
			this.complainOnce(connection, 'sent a malformed worker_log (stream or text invalid); ignored');
			return;
		}
		if (message.dropped !== undefined && message.dropped > 0) {
			connection.file.append(
				'daemon',
				`[worker] ${String(message.dropped)} characters of its output were dropped by the worker itself (its rate cap) before this point\n`
			);
		}
		const kept = message.text.slice(0, WORKER_LOG_MESSAGE_MAX_CHARS);
		const cutByMessageCap = message.text.length - kept.length;
		const bytes = Buffer.byteLength(kept);
		const nowMs = this.now();
		if (nowMs - connection.windowStartMs >= 1000) {
			connection.windowStartMs = nowMs;
			connection.windowBytes = 0;
		}
		if (connection.windowBytes + bytes > this.maxBytesPerSecond) {
			connection.dropped += message.text.length;
			return;
		}
		connection.windowBytes += bytes;
		this.flushDroppedMarker(connection);
		if (cutByMessageCap > 0) {
			connection.dropped += cutByMessageCap;
		}
		connection.file.append(message.stream, kept);
		this.flushDroppedMarker(connection);
	}

	/** Ends the log of a connection: says how it ended, flushes the open lines. */
	close(ws: WebSocket, text: string): void {
		const connection = this.connections.get(ws);
		if (connection === undefined) {
			return;
		}
		this.flushDroppedMarker(connection);
		connection.file.append('daemon', `${text}\n`);
		connection.file.close();
		this.connections.delete(ws);
	}

	private flushDroppedMarker(connection: Connection): void {
		if (connection.dropped === 0) {
			return;
		}
		const dropped = connection.dropped;
		connection.dropped = 0;
		connection.file.append(
			'daemon',
			`[daemon] ${String(dropped)} characters of this worker's output were dropped (over ${String(this.maxBytesPerSecond)} bytes per second, or a message over ${String(WORKER_LOG_MESSAGE_MAX_CHARS)} characters)\n`
		);
	}

	private complainOnce(connection: Connection | undefined, reason: string): void {
		if (connection === undefined) {
			this.log('error', `a connection ${reason}`);
			return;
		}
		if (connection.complained) {
			return;
		}
		connection.complained = true;
		this.log('error', `a worker ${reason}`);
	}

	/** Never logs raw text: a masker that throws replaces the line. */
	private safeMask(text: string): string {
		try {
			return this.mask(text);
		} catch {
			return MASKING_FAILED;
		}
	}
}
