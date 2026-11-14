import type { Clock } from '../Clock';
import type { CancelScheduled, Scheduler } from '../Scheduler';

/**
 * The `worker-logs` protocol of the flow daemon (flow-cli `Protocol.ts`: `WORKER_FEATURE_WORKER_LOGS`,
 * `WORKER_LOG_CHUNK_MAX_CHARS`, message `worker_log`). This branch's copy of flow-cli predates it, so the values are
 * declared here; replace them with the import once flow-cli on this branch has them.
 */
export const WORKER_FEATURE_WORKER_LOGS = 'worker-logs';
/** Most characters of one `worker_log` text. */
export const WORKER_LOG_CHUNK_MAX_CHARS = 16 * 1024;

/** What is kept while the daemon has not enabled shipping (the banner, the first lines): the newest of it. */
export const SHIPPER_BACKLOG_MAX_CHARS = 64 * 1024;
/** What may leave per second; the rest waits, and is dropped (and counted in `dropped`) only when the backlog overflows. */
export const SHIPPER_MAX_CHARS_PER_SECOND = 64 * 1024;
/** Output is sent in batches this far apart, so a chatty wrapper does not send one frame per line. */
export const SHIPPER_FLUSH_INTERVAL_MS = 250;

type Stream = 'stdout' | 'stderr';

export interface WorkerLogMessage {
	type: 'worker_log';
	stream: Stream;
	text: string;
	dropped?: number;
}

/** A stream the shipper listens to: only `write` is replaced, so anything with that method works (tests need no process). */
export interface WritableLike {
	write: (...args: never[]) => unknown;
}

export interface WorkerLogShipperOptions {
	clock: Clock;
	scheduler: Scheduler;
	/** Called once, when a send fails. It must not print through the watched streams (that would loop). */
	onSendFailure: (error: unknown) => void;
}

interface Piece {
	stream: Stream;
	text: string;
}

/**
 * Copies what the wrapper process prints (its own stdout and stderr, the exact text of its log lines) to the daemon as
 * `worker_log` messages, so the lines show in the daemon's worker log. It adds no content: the original `write` runs first
 * and its result is returned untouched.
 *
 * Nothing is sent until the daemon enabled shipping on this connection ({@link attach}, after `worker_logs_enabled`): an
 * older daemon never does and would reject the message. What is printed before (the banner, preparation) is kept, newest
 * {@link SHIPPER_BACKLOG_MAX_CHARS} characters, and sent at attach. After {@link detach} (connection closed) output is
 * kept again. Messages are at most {@link WORKER_LOG_CHUNK_MAX_CHARS} characters, {@link SHIPPER_MAX_CHARS_PER_SECOND}
 * per second; what is lost is counted and reported by the next message.
 *
 * Mirrors flow-cli's `WorkerOutputShipper`, with the clock and timers injected.
 */
export class WorkerLogShipper {
	private backlog: Piece[] = [];
	private backlogChars = 0;
	private send: ((message: WorkerLogMessage) => void) | undefined;
	private cancelTimer: CancelScheduled | undefined;
	private windowStartMs = 0;
	private windowChars = 0;
	private dropped = 0;
	private failureReported = false;
	private restore: (() => void)[] = [];

	constructor(private readonly options: WorkerLogShipperOptions) {}

	/** Starts copying what is written to the two streams. Call once; {@link uninstall} undoes it. */
	install(stdout: WritableLike, stderr: WritableLike): void {
		if (this.restore.length > 0) throw new Error('WorkerLogShipper is already installed');
		for (const [stream, target] of [
			['stdout', stdout],
			['stderr', stderr],
		] as const) {
			const original = target.write;
			target.write = ((...args: unknown[]) => {
				const result = (original as (...a: unknown[]) => unknown).apply(target, args);
				this.capture(stream, args[0]);
				return result;
			}) as WritableLike['write'];
			this.restore.push(() => {
				target.write = original;
			});
		}
	}

	uninstall(): void {
		for (const undo of this.restore) undo();
		this.restore = [];
		this.detach();
	}

	/** The daemon enabled shipping on this connection: sends what was kept, then everything that follows. */
	attach(send: (message: WorkerLogMessage) => void): void {
		this.send = send;
		this.flush();
	}

	/** The connection ended: output is kept again until the next one enables shipping. */
	detach(): void {
		this.send = undefined;
		this.cancelTimer?.();
		this.cancelTimer = undefined;
	}

	private capture(stream: Stream, chunk: unknown): void {
		let text =
			typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : '';
		if (text === '') return;
		// One huge write must not sit in memory whole: only its end can be kept.
		if (text.length > SHIPPER_BACKLOG_MAX_CHARS) {
			this.dropped += text.length - SHIPPER_BACKLOG_MAX_CHARS;
			text = text.slice(-SHIPPER_BACKLOG_MAX_CHARS);
		}
		this.backlog.push({ stream, text });
		this.backlogChars += text.length;
		while (this.backlogChars > SHIPPER_BACKLOG_MAX_CHARS && this.backlog.length > 1) {
			const oldest = this.backlog.shift();
			this.backlogChars -= oldest?.text.length ?? 0;
			this.dropped += oldest?.text.length ?? 0;
		}
		if (this.send !== undefined) this.scheduleFlush();
	}

	private scheduleFlush(): void {
		if (this.cancelTimer !== undefined) return;
		this.cancelTimer = this.options.scheduler.schedule(SHIPPER_FLUSH_INTERVAL_MS, () => {
			this.cancelTimer = undefined;
			this.flush();
		});
	}

	private flush(): void {
		const send = this.send;
		if (send === undefined) return;
		while (this.backlog.length > 0) {
			const piece = this.backlog[0];
			if (piece === undefined) break;
			const nowMs = this.options.clock.now();
			if (nowMs - this.windowStartMs >= 1000) {
				this.windowStartMs = nowMs;
				this.windowChars = 0;
			}
			const room = SHIPPER_MAX_CHARS_PER_SECOND - this.windowChars;
			if (room <= 0) {
				// Over the cap for this second: what is left waits for the next flush (capture drops the oldest if the backlog overflows).
				this.scheduleFlush();
				return;
			}
			const text = piece.text.slice(0, Math.min(room, WORKER_LOG_CHUNK_MAX_CHARS));
			const rest = piece.text.slice(text.length);
			this.backlog.shift();
			this.backlogChars -= piece.text.length;
			if (rest !== '') {
				this.backlog.unshift({ stream: piece.stream, text: rest });
				this.backlogChars += rest.length;
			}
			this.windowChars += text.length;
			try {
				send({
					type: 'worker_log',
					stream: piece.stream,
					text,
					...(this.dropped > 0 && { dropped: this.dropped }),
				});
				this.dropped = 0;
			} catch (error) {
				this.dropped += text.length;
				this.reportFailureOnce(error);
			}
		}
	}

	private reportFailureOnce(error: unknown): void {
		if (this.failureReported) return;
		this.failureReported = true;
		this.options.onSendFailure(error);
	}
}
