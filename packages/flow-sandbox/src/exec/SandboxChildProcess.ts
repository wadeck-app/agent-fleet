import type { ProcessSignal } from 'flow-engine';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

/** Smallest synthetic pid: above any real pid of Windows, Linux (pid_max 4194304) and macOS, so it never names a host process. */
export const FIRST_SYNTHETIC_PID = 2_000_000_000;

/** What `stdio[0]` of the spawn options asked for. `inherit` is refused earlier (an interactive terminal cannot reach a VM). */
export type StandardInputMode = 'pipe' | 'ignore';
export type OutputMode = 'pipe' | 'ignore';

export interface SandboxChildProcessOptions {
	pid: number;
	command: string;
	args: readonly string[];
	stdin: StandardInputMode;
	stdout: OutputMode;
	stderr: OutputMode;
	/** Called when the caller asks the process to end (`kill`). The launcher stops the sandbox. */
	onKill: (signal: ProcessSignal) => void;
}

/**
 * The part of `ChildProcess` the engine uses, for a process that runs in a sandbox through `sbx exec`.
 * The object is not a real `ChildProcess` (there is no host process behind it); it is handed to the engine through
 * `ProcessLauncher.spawn`, which is typed `ChildProcess`, so it is cast once, here, and the supported surface is:
 * `pid` (synthetic), `stdin`/`stdout`/`stderr`, `exitCode`, `signalCode`, `killed`, `kill()`, the events `error`,
 * `exit` and `close`, `spawnfile`, `spawnargs`.
 *
 * Exit mapping (exact limits): `sbx exec` reports only a numeric exit code. A process killed by a signal inside the VM
 * therefore shows as `exitCode` 128+n and `signalCode` null: the code is not guessed into a signal. `signalCode` is
 * set only when THIS object was asked to end (`kill`) and the sandbox was stopped for it.
 */
export class SandboxChildProcess extends EventEmitter {
	readonly pid: number;
	readonly spawnfile: string;
	readonly spawnargs: string[];
	readonly stdin: Writable | null;
	readonly stdout: PassThrough | null;
	readonly stderr: PassThrough | null;
	readonly connected = false;
	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	killed = false;

	private readonly collectedInput: Buffer[] = [];
	private inputEnded = false;
	private inputWriteError: Error | undefined;
	private resolveInput: (() => void) | undefined;
	private finished = false;

	constructor(private readonly options: SandboxChildProcessOptions) {
		super();
		this.pid = options.pid;
		this.spawnfile = options.command;
		this.spawnargs = [options.command, ...options.args];
		this.stdout = options.stdout === 'pipe' ? new PassThrough() : null;
		this.stderr = options.stderr === 'pipe' ? new PassThrough() : null;
		this.stdin = options.stdin === 'pipe' ? this.createInput() : null;
	}

	/**
	 * Everything written to `stdin` up to now, once `end()` was called or `waitMs` elapsed. Input written later cannot
	 * reach the process (`sbx exec` takes the whole input at start): such a write fails with an actionable error.
	 */
	async takeInput(waitMs: number): Promise<Buffer | undefined> {
		if (this.stdin === null) return undefined;
		if (!this.inputEnded) {
			await new Promise<void>(resolve => {
				const timer = setTimeout(resolve, waitMs);
				this.resolveInput = () => {
					clearTimeout(timer);
					resolve();
				};
			});
		}
		this.resolveInput = undefined;
		if (!this.inputEnded) {
			this.inputWriteError = new Error(
				'The process runs in a sandbox through `sbx exec`, which takes its standard input once, at start. ' +
					'This process was started while its stdin was still open and not written; later writes cannot reach it. ' +
					'Write the input and call end() right after spawn, or spawn with stdin "ignore".'
			);
			this.inputEnded = true;
			return undefined;
		}
		return Buffer.concat(this.collectedInput);
	}

	/** Output from the sandbox. Ignored when the caller asked for no pipe. */
	pushStdout(text: string): void {
		this.stdout?.write(text);
	}

	pushStderr(text: string): void {
		this.stderr?.write(text);
	}

	/** The process is over: sets the exit state, then emits `exit` and, once the output was drained, `close`. */
	async finish(exit: { code: number | null; signal: NodeJS.Signals | null }): Promise<void> {
		if (this.finished) return;
		this.finished = true;
		this.exitCode = exit.code;
		this.signalCode = exit.signal;
		this.emit('exit', exit.code, exit.signal);
		await Promise.all([this.drain(this.stdout), this.drain(this.stderr)]);
		this.emit('close', exit.code, exit.signal);
	}

	/** The process could not be started (staging, rule, sbx failure): `error`, then a closed process like a failed spawn. */
	async fail(error: Error): Promise<void> {
		if (this.finished) return;
		this.finished = true;
		if (this.listenerCount('error') > 0) {
			this.emit('error', error);
		} else {
			// An unhandled 'error' event would throw inside the launcher. Nobody listens, so the reason goes where a
			// caller that reads the output will see it, and the process ends with a failure code.
			this.stderr?.write(`[flow] ${error.message}
`);
			this.exitCode = 1;
		}
		await Promise.all([this.drain(this.stdout), this.drain(this.stderr)]);
		this.emit('close', null, null);
	}

	get isFinished(): boolean {
		return this.finished;
	}

	kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
		if (this.finished) return false;
		this.killed = true;
		this.options.onKill(signal === 'SIGKILL' || signal === 9 ? 'SIGKILL' : 'SIGTERM');
		return true;
	}

	ref(): void {
		// No host handle to keep alive: the sbx exec promise does.
	}

	unref(): void {
		// See ref().
	}

	private createInput(): Writable {
		return new Writable({
			write: (chunk: Buffer | string, _encoding, callback) => {
				if (this.inputEnded) {
					callback(
						this.inputWriteError ??
							new Error('Cannot write to the standard input of a sandbox process after end().')
					);
					return;
				}
				this.collectedInput.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				callback();
			},
			final: callback => {
				this.inputEnded = true;
				this.resolveInput?.();
				callback();
			},
		});
	}

	private drain(stream: PassThrough | null): Promise<void> {
		if (stream === null || stream.destroyed) return Promise.resolve();
		return new Promise<void>(resolve => {
			stream.once('close', () => resolve());
			stream.once('end', () => resolve());
			// A stream nobody reads would never end.
			if (stream.listenerCount('data') === 0 && stream.listenerCount('readable') === 0) stream.resume();
			stream.end();
		});
	}
}

/** The object as the engine sees it. */
export function asChildProcess(child: SandboxChildProcess): ChildProcess {
	return child as unknown as ChildProcess;
}
