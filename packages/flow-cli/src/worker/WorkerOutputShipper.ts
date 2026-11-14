import { WORKER_LOG_CHUNK_MAX_CHARS, type WorkerToDaemon } from '../ipc/Protocol';

type OutputMessage = Extract<WorkerToDaemon, { type: 'worker_log' }>;
type Stream = OutputMessage['stream'];

/** A stream the shipper listens to: only `write` is replaced, so anything with that method works (and tests need no process). */
export interface WritableLike {
	write: (...args: never[]) => unknown;
}

/** What is kept while the daemon has not enabled shipping (the banner, the first connection attempts): the newest of it. */
export const SHIPPER_BACKLOG_MAX_CHARS = 64 * 1024;
/** What may leave per second; the rest is dropped and counted in the next message (`dropped`). */
export const SHIPPER_MAX_CHARS_PER_SECOND = 64 * 1024;
/** Output is sent in batches this far apart, so a chatty worker does not send one frame per line. */
export const SHIPPER_FLUSH_INTERVAL_MS = 250;

interface Piece {
	stream: Stream;
	text: string;
}

export interface WorkerOutputShipperOptions {
	now?: () => number;
	/** Called once when a send fails: the shipper never prints through the streams it listens to (that would loop). */
	onSendFailure?: (error: unknown) => void;
}

/**
 * Copies what a worker prints (its stdout and stderr: connection state, step start and end, warnings, errors, exactly what
 * the terminal shows) to the daemon as `worker_log` messages, so the worker's log exists wherever the worker runs.
 *
 * It does nothing visible: the original `write` runs first and its result is returned untouched. Nothing is sent until the
 * daemon enabled shipping on this connection ({@link attach}, after `worker_logs_enabled`): an older daemon never does, and
 * would reject the message. What is printed before that (and between connections) is kept, newest {@link SHIPPER_BACKLOG_MAX_CHARS}
 * characters, and sent at attach. Volume is capped per second; what is cut is counted and said by the next message.
 *
 * Output of child processes that inherit the worker's stdio is not seen here, only what goes through this process's own
 * `write`. A worker's own stdout that is a TTY is still a TTY: only `write` is wrapped.
 */
export class WorkerOutputShipper {
	private backlog: Piece[] = [];
	private backlogChars = 0;
	private send: ((message: OutputMessage) => void) | undefined;
	private timer: NodeJS.Timeout | undefined;
	private windowStartMs = 0;
	private windowChars = 0;
	private dropped = 0;
	private failureReported = false;
	private restore: (() => void)[] = [];
	private readonly now: () => number;

	constructor(private readonly options: WorkerOutputShipperOptions = {}) {
		this.now = options.now ?? Date.now;
	}

	/** Starts copying what is written to the two streams. Call once; {@link uninstall} undoes it. */
	install(stdout: WritableLike, stderr: WritableLike): void {
		if (this.restore.length > 0) {
			throw new Error('WorkerOutputShipper is already installed');
		}
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
		for (const undo of this.restore) {
			undo();
		}
		this.restore = [];
		this.detach();
	}

	/** The daemon enabled shipping on this connection: sends what was kept, then everything that follows. */
	attach(send: (message: OutputMessage) => void): void {
		this.send = send;
		this.flush();
	}

	/** The connection ended: output is kept again until the next one enables shipping. */
	detach(): void {
		this.send = undefined;
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private capture(stream: Stream, chunk: unknown): void {
		let text =
			typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : '';
		if (text === '') {
			return;
		}
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
		if (this.send !== undefined && this.timer === undefined) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.flush();
			}, SHIPPER_FLUSH_INTERVAL_MS);
			// A pending flush must never keep a worker that wants to exit alive.
			this.timer.unref();
		}
	}

	private flush(): void {
		const send = this.send;
		if (send === undefined) {
			return;
		}
		while (this.backlog.length > 0) {
			const piece = this.backlog[0];
			if (piece === undefined) {
				break;
			}
			const nowMs = this.now();
			if (nowMs - this.windowStartMs >= 1000) {
				this.windowStartMs = nowMs;
				this.windowChars = 0;
			}
			const room = SHIPPER_MAX_CHARS_PER_SECOND - this.windowChars;
			if (room <= 0) {
				// Over the cap for this second: what is left waits for the next flush, unless the backlog itself overflows (capture).
				this.scheduleRetry();
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
			} catch (err) {
				this.dropped += text.length;
				this.reportFailureOnce(err);
			}
		}
	}

	private scheduleRetry(): void {
		if (this.timer !== undefined) {
			return;
		}
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.flush();
		}, SHIPPER_FLUSH_INTERVAL_MS);
		this.timer.unref();
	}

	private reportFailureOnce(err: unknown): void {
		if (this.failureReported) {
			return;
		}
		this.failureReported = true;
		this.options.onSendFailure?.(err);
	}
}
