import { type ChildProcess, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import { BoundedText } from './BoundedText';
import { SandboxError } from './SandboxError';
import type { SbxBinary } from './SbxBinaryLocator';

export interface SbxProcessRequest {
	binary: SbxBinary;
	/** Arguments after the binary. Never interpreted by a shell. */
	args: readonly string[];
	env: NodeJS.ProcessEnv;
	stdin?: string | Uint8Array;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
	signal?: AbortSignal;
	timeoutMs: number;
}

export interface SbxProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Errors of a write to the standard input of a child that already exited. */
const CLOSED_STDIN_CODES = new Set(['EPIPE', 'EOF', 'ECONNRESET']);

/**
 * Runs one sbx process: `shell: false`, hidden window, streamed output, abort and time limit.
 * Knows nothing about sbx verbs: command lines are built by SbxCliRuntime only.
 */
export class SbxProcess {
	run(request: SbxProcessRequest): Promise<SbxProcessResult> {
		const { binary, signal } = request;
		if (signal?.aborted === true) {
			return Promise.reject(this.abortedError());
		}

		return new Promise<SbxProcessResult>((resolve, reject) => {
			let child: ChildProcess;
			try {
				child = spawn(binary.command, [...binary.prefixArgs, ...request.args], {
					env: request.env,
					shell: false,
					windowsHide: true,
					stdio: [request.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
				});
			} catch (error) {
				// Windows reports a file that is not an executable (EFTYPE) synchronously, other systems through 'error'.
				reject(this.cannotStart(binary, error));
				return;
			}

			const stdoutDecoder = new StringDecoder('utf8');
			const stderrDecoder = new StringDecoder('utf8');
			// Bounded: the caller gets every chunk through onStdout/onStderr; the result keeps the head and the tail only.
			const stdout = new BoundedText();
			const stderr = new BoundedText();
			let settled = false;
			let failure: SandboxError | undefined;

			const settleWith = (action: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				action();
			};

			const stop = (error: SandboxError): void => {
				failure ??= error;
				child.kill();
			};

			const onAbort = (): void => stop(this.abortedError());
			const timer = setTimeout(() => {
				stop(
					new SandboxError(
						'timeout',
						`sbx did not finish within ${request.timeoutMs} ms and was killed (${binary.displayPath} ${request.args.slice(0, 2).join(' ')}). ` +
							'The operation may have partly completed: list the sandboxes before retrying.'
					)
				);
			}, request.timeoutMs);
			signal?.addEventListener('abort', onAbort, { once: true });

			child.stdout?.on('data', (data: Buffer) => {
				const text = stdoutDecoder.write(data);
				stdout.append(text);
				if (text !== '') request.onStdout?.(text);
			});
			child.stderr?.on('data', (data: Buffer) => {
				const text = stderrDecoder.write(data);
				stderr.append(text);
				if (text !== '') request.onStderr?.(text);
			});

			child.on('error', (error: Error) => {
				settleWith(() => reject(this.cannotStart(binary, error)));
			});

			child.on('close', (code: number | null) => {
				settleWith(() => {
					if (failure !== undefined) {
						reject(failure);
						return;
					}
					if (code === null) {
						reject(
							new SandboxError(
								'command-failed',
								`sbx was terminated by a signal (${binary.displayPath}).`,
								{
									exitCode: null,
									stderr: stderr.toString(),
								}
							)
						);
						return;
					}
					stdout.append(stdoutDecoder.end());
					stderr.append(stderrDecoder.end());
					resolve({ exitCode: code, stdout: stdout.toString(), stderr: stderr.toString() });
				});
			});

			if (request.stdin !== undefined && child.stdin) {
				child.stdin.on('error', (error: NodeJS.ErrnoException) => {
					// The child may exit before reading its input (EPIPE on POSIX, EOF on Windows): the exit code carries the real outcome.
					if (!CLOSED_STDIN_CODES.has(error.code ?? '')) {
						stop(
							new SandboxError('command-failed', `Cannot write to sbx standard input: ${error.message}`, {
								cause: error,
							})
						);
					}
				});
				child.stdin.end(request.stdin);
			}
		});
	}

	private cannotStart(binary: SbxBinary, error: unknown): SandboxError {
		const reason = error instanceof Error ? error.message : String(error);
		return new SandboxError(
			'binary-missing',
			`Cannot start sbx (${binary.displayPath}): ${reason}. ` +
				'Check that the file exists and is executable, or set SBX_PATH / the "binaryPath" option.',
			{ cause: error }
		);
	}

	private abortedError(): SandboxError {
		return new SandboxError(
			'aborted',
			'The sbx command was aborted. The host-side process was killed, but sbx does NOT stop a process already ' +
				'running inside the sandbox: stop the sandbox if that process must end.'
		);
	}
}
