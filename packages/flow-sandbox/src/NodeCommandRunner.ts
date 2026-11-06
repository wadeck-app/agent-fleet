import { type ChildProcessByStdio, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type { CommandRunRequest, CommandRunResult, CommandRunner } from './CommandRunner';
import { SandboxError } from './SandboxError';
import { WorkerCredentialFilter } from './WorkerCredentialFilter';

/** Output kept per stream; a command that prints more is killed (a credential document is a few hundred bytes). */
const MAX_OUTPUT_CHARACTERS = 1024 * 1024;

/** CommandRunner over `child_process.spawn`: `shell: false`, hidden window, time limit, output cap. */
export class NodeCommandRunner implements CommandRunner {
	run(request: CommandRunRequest): Promise<CommandRunResult> {
		return new Promise<CommandRunResult>((resolve, reject) => {
			let child: ChildProcessByStdio<null, Readable, Readable>;
			try {
				child = spawn(request.command, [...request.args], {
					env: WorkerCredentialFilter.apply(request.env ?? process.env),
					shell: false,
					windowsHide: true,
					stdio: ['ignore', 'pipe', 'pipe'],
				});
			} catch (error) {
				// Windows reports a file that is not an executable synchronously, other systems through the 'error' event.
				reject(this.cannotStart(request, error as NodeJS.ErrnoException));
				return;
			}

			const stdoutDecoder = new StringDecoder('utf8');
			const stderrDecoder = new StringDecoder('utf8');
			let stdout = '';
			let stderr = '';
			let failure: SandboxError | undefined;
			let settled = false;

			const finish = (action: () => void): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				action();
			};
			const kill = (error: SandboxError): void => {
				failure ??= error;
				child.kill();
			};

			const timer = setTimeout(() => {
				kill(
					new SandboxError(
						'timeout',
						`"${request.command}" did not finish within ${request.timeoutMs} ms and was killed.`
					)
				);
			}, request.timeoutMs);

			child.stdout.on('data', (chunk: Buffer) => {
				stdout += stdoutDecoder.write(chunk);
				if (stdout.length > MAX_OUTPUT_CHARACTERS) {
					kill(this.tooMuchOutput(request, 'standard output'));
				}
			});
			child.stderr.on('data', (chunk: Buffer) => {
				stderr += stderrDecoder.write(chunk);
				if (stderr.length > MAX_OUTPUT_CHARACTERS) {
					kill(this.tooMuchOutput(request, 'standard error'));
				}
			});
			child.on('error', (error: NodeJS.ErrnoException) => {
				finish(() => reject(this.cannotStart(request, error)));
			});
			child.on('close', (code: number | null) => {
				finish(() => {
					if (failure !== undefined) {
						reject(failure);
						return;
					}
					stdout += stdoutDecoder.end();
					stderr += stderrDecoder.end();
					resolve({ exitCode: code ?? -1, stdout, stderr });
				});
			});
		});
	}

	private tooMuchOutput(request: CommandRunRequest, stream: string): SandboxError {
		return new SandboxError(
			'command-failed',
			`"${request.command}" wrote more than ${MAX_OUTPUT_CHARACTERS} characters to ${stream} and was killed.`
		);
	}

	private cannotStart(request: CommandRunRequest, error: NodeJS.ErrnoException): SandboxError {
		const missing = error.code === 'ENOENT';
		return new SandboxError(
			missing ? 'binary-missing' : 'command-failed',
			missing
				? `Cannot find "${request.command}" on the PATH of this process. Install it or give its full path.`
				: `Cannot start "${request.command}": ${error.message}`,
			{ cause: error }
		);
	}
}
