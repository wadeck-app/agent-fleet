/**
 * Script Executor
 *
 * Executes shell scripts/commands and captures output.
 * Simple wrapper around child_process for flow steps.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NtStatusDescriber } from './NtStatusDescriber';
import { BashInvocation } from './shell/BashInvocation';
import { BashShellStrategy } from './shell/BashShellStrategy';
import { CmdShellStrategy } from './shell/CmdShellStrategy';
import { PwshShellStrategy } from './shell/PwshShellStrategy';
import type { ShellStrategy } from './shell/ShellStrategy';
import { ensureGitCoreutilsOnPath, normalizePathKey, resolveBashOnWindows } from './shell/WindowsBashEnvironment';

export { normalizePathKey };

/**
 * Result of script execution
 */
export interface ScriptExecutionResult {
	/** Exit code (0 = success) */
	exitCode: number;

	/** Standard output */
	stdout: string;

	/** Standard error */
	stderr: string;

	/** Execution duration in milliseconds */
	durationMs: number;

	/** Whether execution was successful (exitCode === 0) */
	success: boolean;

	/** Shell/binary the script was run with (for failure diagnostics) */
	shellPath?: string;

	/** Working directory the script ran in (for failure diagnostics) */
	workingDir?: string;

	/** True when the script ran under bash `-e -u` (strict mode). Drives the failure hint. */
	strictApplied?: boolean;
}

/**
 * Options for script execution
 */
export interface ScriptExecutionOptions {
	/** Script/command to execute */
	script: string;

	/** Working directory (defaults to current directory) */
	workingDir?: string;

	/** Environment variables (merged with process.env) */
	env?: Record<string, string>;

	/** Timeout in milliseconds (0 = no timeout) */
	timeout?: number;

	/** Shell to use (defaults to platform default) */
	shell?: string | boolean;

	/**
	 * Explicit shell kind requested via the step's `shell:` YAML field.
	 * Distinct from `shell` above (which is passed straight to Node's spawn). When set, takes
	 * priority over the implicit Windows multiline-bash heuristic and dispatches through the
	 * matching ShellStrategy (see ./shell/*.ts).
	 */
	shellKind?: 'bash' | 'cmd' | 'pwsh';

	/** Stream stdout/stderr in real-time with timestamps (default: false) */
	streaming?: boolean;

	/** Step ID for streaming output labels (optional) */
	stepId?: string;

	/**
	 * When true (default), the subprocess only receives PATH, TEMP/TMP, HOME,
	 * and the step's declared env vars. No credentials from the parent process leak.
	 * Set to false only when full env inheritance is explicitly required.
	 */
	isolateEnv?: boolean;

	/**
	 * Run bash scripts with errexit + nounset (`bash -e -u`). Default true; false restores the
	 * historical behaviour (exit code = last command). Only meaningful for bash (explicit
	 * `shellKind: 'bash'` or the implicit Windows multi-line path); cmd/pwsh ignore it.
	 */
	strict?: boolean;
}

/**
 * Script execution error
 */
export class ScriptExecutionError extends Error {
	constructor(
		message: string,
		public exitCode: number,
		public stdout: string,
		public stderr: string
	) {
		super(message);
		this.name = 'ScriptExecutionError';
	}
}

/**
 * Script Executor class
 */
export class ScriptExecutor {
	/**
	 * Execute a script and return the result
	 *
	 * @param options - Execution options
	 * @returns Execution result
	 */
	public async execute(options: ScriptExecutionOptions): Promise<ScriptExecutionResult> {
		const startTime = Date.now();
		const workingDir = options.workingDir || process.cwd();
		const shouldIsolate = options.isolateEnv !== false; // default true
		const baseEnv: NodeJS.ProcessEnv = shouldIsolate
			? {
					PATH: process.env['PATH'],
					HOME: process.env['HOME'],
					TMPDIR: process.env['TMPDIR'],
					TEMP: process.env['TEMP'],
					TMP: process.env['TMP'],
					// Windows
					...(process.platform === 'win32' && process.env['SystemRoot']
						? { SystemRoot: process.env['SystemRoot'] }
						: {}),
					...(process.platform === 'win32' && process.env['USERPROFILE']
						? { USERPROFILE: process.env['USERPROFILE'] }
						: {}),
					// The launcher pins this to Git's bash.exe because WScript.Shell.Run drops the
					// Git Bash PATH enrichment; without it, resolveBashOnWindows() can only fall
					// back to known install paths or an unqualified 'bash' lookup.
					...(process.platform === 'win32' && process.env['FLOW_BASH_PATH']
						? { FLOW_BASH_PATH: process.env['FLOW_BASH_PATH'] }
						: {}),
				}
			: { ...process.env };
		const rawEnv = { ...baseEnv, ...options.env };
		const cleanEnv: Record<string, string> = {};
		for (const [k, v] of Object.entries(rawEnv)) {
			if (v !== undefined) cleanEnv[k] = v;
		}
		const shell = options.shell !== undefined ? options.shell : true;
		const strict = options.strict !== false;

		// Handle multiline scripts on Windows: cmd.exe cannot handle multi-line shell commands,
		// so we write them to a temp file and execute that instead.
		let scriptToExecute = options.script;
		let tempFilePath: string | null = null;
		const isWindows = process.platform === 'win32';
		const isMultiline = options.script.includes('\n') || options.script.includes('\r\n');

		// Explicit `shell:` field on the step takes priority over the implicit Windows
		// multiline-bash heuristic below -- the user asked for a specific shell, so we must
		// honor it (and fail fast via strategy.resolve() if that shell isn't available)
		// rather than silently falling through to the generic/bash paths.
		if (options.shellKind) {
			const shellKind = options.shellKind;
			const strategy: ShellStrategy =
				shellKind === 'bash'
					? new BashShellStrategy()
					: shellKind === 'cmd'
						? new CmdShellStrategy()
						: new PwshShellStrategy();
			// Only bash needs the PATH-casing fix (see normalizePathKey) -- cmd/pwsh resolve
			// their binary and spawn via Windows' own case-insensitive env lookups.
			const shellEnv = shellKind === 'bash' ? normalizePathKey(cleanEnv) : cleanEnv;
			// Synchronous throw inside this async method becomes a rejected promise --
			// no try/catch here on purpose, so resolve() errors propagate verbatim.
			const binary = strategy.resolve(shellEnv);
			// Git's bash is a thin shell: without its coreutils dirs on PATH, `sed`/`dirname` and npm
			// POSIX shims fail with "command not found" when the daemon started without Git Bash on
			// PATH (same as the implicit-bash path below).
			if (shellKind === 'bash' && process.platform === 'win32') ensureGitCoreutilsOnPath(shellEnv, binary);

			const tempDir = os.tmpdir();
			const timestamp = Date.now();
			const random = Math.random().toString(36).substring(7);
			const extension = shellKind === 'bash' ? 'sh' : shellKind === 'cmd' ? 'bat' : 'ps1';
			const kindTempFilePath = path.join(tempDir, `agent-fleet-script-${timestamp}-${random}.${extension}`);
			fs.writeFileSync(kindTempFilePath, options.script, 'utf8');

			const args =
				shellKind === 'bash'
					? BashInvocation.buildArgs(kindTempFilePath, strict)
					: shellKind === 'cmd'
						? ['/d', '/c', kindTempFilePath]
						: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', kindTempFilePath];

			return this.runViaTempFileBinary(
				binary,
				args,
				kindTempFilePath,
				options,
				startTime,
				workingDir,
				shellEnv,
				shellKind === 'bash' && strict
			);
		}

		if (isWindows && isMultiline && shell) {
			const tempDir = os.tmpdir();
			const timestamp = Date.now();
			const random = Math.random().toString(36).substring(7);

			// Detect `node -e "code"` pattern: extract to a .js file.
			const nodeEMatch = /^node\s+-e\s+"([^"]*)"$/.exec(options.script.trim());
			if (nodeEMatch) {
				const jsContent = nodeEMatch[1];
				tempFilePath = path.join(tempDir, `agent-fleet-script-${timestamp}-${random}.js`);
				fs.writeFileSync(tempFilePath, jsContent, 'utf8');
				scriptToExecute = `node "${tempFilePath}"`;
			} else {
				// Write to a .sh file and execute with bash.
				// Bash is available on Windows via Git Bash / MSYS2 and is already on PATH
				// (confirmed by the MSYS2 PATH entries in process.env.PATH on this system).
				// This avoids cmd.exe which doesn't support bash syntax ($VAR, pipes, etc.).
				tempFilePath = path.join(tempDir, `agent-fleet-script-${timestamp}-${random}.sh`);
				fs.writeFileSync(tempFilePath, options.script, { encoding: 'utf8' });
				// Resolve bash.exe explicitly: WScript.Shell.Run (daemon launcher) spawns with the system PATH,
				// where a bare `bash` finds System32's WSL bash first. normalizePathKey: `{...process.env}`
				// can yield `Path` instead of `PATH`, which bash's case-sensitive lookup would miss.
				const bashEnv = normalizePathKey(cleanEnv);
				const bashExecutable = resolveBashOnWindows(bashEnv);
				ensureGitCoreutilsOnPath(bashEnv, bashExecutable);
				return this.runViaTempFileBinary(
					bashExecutable,
					BashInvocation.buildArgs(tempFilePath, strict),
					tempFilePath,
					options,
					startTime,
					workingDir,
					bashEnv,
					strict
				);
			}
		}

		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let killed = false;
			// shell: true means cmd.exe (via ComSpec) on Windows, /bin/sh elsewhere
			const genericShellPath =
				typeof shell === 'string'
					? shell
					: shell
						? process.platform === 'win32'
							? (process.env['ComSpec'] ?? 'cmd.exe')
							: '/bin/sh'
						: undefined;

			// Helper to clean up temp file
			const cleanupTempFile = () => {
				if (tempFilePath && fs.existsSync(tempFilePath)) {
					try {
						fs.unlinkSync(tempFilePath);
					} catch (err) {
						// Ignore cleanup errors
					}
				}
			};

			// Spawn process
			// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so grandchildren allocate a visible console; the script must inherit the daemon's hidden console (d032e7e). Guarded by ScriptExecutor.windows-console.test.ts
			const child = spawn(scriptToExecute, [], {
				cwd: workingDir,
				env: cleanEnv,
				shell,
				stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, capture stdout/stderr
			});

			// Helper to format timestamp
			const getTimestamp = () => {
				const now = new Date();
				return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
			};

			// Capture stdout
			child.stdout?.on('data', data => {
				const text = data.toString();
				stdout += text;

				// Stream output in real-time if enabled
				if (options.streaming) {
					const lines = text.split('\n');
					lines.forEach((line: string, index: number) => {
						// Skip empty last line from split
						if (index === lines.length - 1 && line === '') return;
						const timestamp = getTimestamp();
						const prefix = options.stepId ? `[${options.stepId}]` : '';
						console.log(`      ${prefix} [${timestamp}] ${line}`);
					});
				}
			});

			// Capture stderr
			child.stderr?.on('data', data => {
				const text = data.toString();
				stderr += text;

				// Stream output in real-time if enabled
				if (options.streaming) {
					const lines = text.split('\n');
					lines.forEach((line: string, index: number) => {
						// Skip empty last line from split
						if (index === lines.length - 1 && line === '') return;
						const timestamp = getTimestamp();
						const prefix = options.stepId ? `[${options.stepId}]` : '';
						console.error(`      ${prefix} [${timestamp}] ${line}`);
					});
				}
			});

			// Handle timeout
			let timeoutId: NodeJS.Timeout | undefined;
			if (options.timeout && options.timeout > 0) {
				timeoutId = setTimeout(() => {
					killed = true;
					child.kill('SIGTERM');

					// Force kill after 5s if still running
					setTimeout(() => {
						if (!child.killed) {
							child.kill('SIGKILL');
						}
					}, 5000);
				}, options.timeout);
			}

			// Handle exit
			child.on('close', code => {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}

				const durationMs = Date.now() - startTime;
				const exitCode = killed ? -1 : (code ?? -1);

				const result: ScriptExecutionResult = {
					exitCode,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					durationMs,
					success: exitCode === 0,
					shellPath: genericShellPath,
					workingDir,
				};

				// Clean up temp file if created
				cleanupTempFile();

				if (killed) {
					reject(
						new ScriptExecutionError(
							`Script execution timed out after ${options.timeout}ms`,
							-1,
							stdout,
							stderr
						)
					);
				} else {
					resolve(result);
				}
			});

			// Handle errors
			child.on('error', error => {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}

				// Clean up temp file if created
				cleanupTempFile();

				reject(new ScriptExecutionError(`Failed to execute script: ${String(error)}`, -1, stdout, stderr));
			});
		});
	}

	/**
	 * Spawns a resolved shell binary against a temp script file for an explicit `shellKind`
	 * dispatch. Mirrors the existing implicit-bash branch's capture/cleanup/timeout contract
	 * (trim stdout/stderr, exitCode `code ?? 1`, reject on spawn `error`) so behavior is
	 * consistent across all explicit shell kinds.
	 */
	private runViaTempFileBinary(
		binary: string,
		args: string[],
		tempFilePath: string,
		options: ScriptExecutionOptions,
		startTime: number,
		workingDir: string,
		cleanEnv: Record<string, string>,
		strictApplied: boolean
	): Promise<ScriptExecutionResult> {
		return new Promise<ScriptExecutionResult>((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let killed = false;
			const cleanup = () => {
				try {
					fs.unlinkSync(tempFilePath);
				} catch {
					/* ignore */
				}
			};
			// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, making grandchildren allocate a visible console -- see d032e7e
			const child = spawn(binary, args, {
				cwd: workingDir,
				env: cleanEnv,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			child.stdout?.on('data', (d: Buffer) => {
				stdout += d.toString();
			});
			child.stderr?.on('data', (d: Buffer) => {
				stderr += d.toString();
			});
			child.on('close', (code: number | null) => {
				cleanup();
				const exitCode = code ?? 1;
				const durationMs = Date.now() - startTime;
				resolve({
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					exitCode,
					durationMs,
					success: exitCode === 0,
					strictApplied,
					shellPath: binary,
					workingDir,
				});
			});
			child.on('error', (err: Error) => {
				cleanup();
				reject(err);
			});
			if (options.timeout) {
				setTimeout(() => {
					killed = true;
					child.kill();
					cleanup();
					resolve({
						stdout,
						stderr,
						exitCode: -1,
						durationMs: Date.now() - startTime,
						success: false,
						shellPath: binary,
						workingDir,
					});
				}, options.timeout);
			}
			void killed; // suppress unused warning
		});
	}

	/**
	 * Execute a script and throw on non-zero exit code
	 *
	 * @param options - Execution options
	 * @returns Execution result
	 * @throws ScriptExecutionError if exit code is non-zero
	 */
	public async executeOrThrow(options: ScriptExecutionOptions): Promise<ScriptExecutionResult> {
		const result = await this.execute(options);

		if (!result.success) {
			const ntStatus = NtStatusDescriber.isNtStatus(result.exitCode);
			const hint = ntStatus ? NtStatusDescriber.hint(result.exitCode) : null;
			const exitDescription = ntStatus ? NtStatusDescriber.format(result.exitCode) : String(result.exitCode);
			throw new ScriptExecutionError(
				`Script failed with exit code ${exitDescription}${hint ? `: ${hint}` : ''}`,
				result.exitCode,
				result.stdout,
				result.stderr
			);
		}

		return result;
	}

	/**
	 * Execute a simple command (convenience method)
	 *
	 * @param script - Script/command to execute
	 * @param workingDir - Optional working directory
	 * @returns Execution result
	 */
	public async run(script: string, workingDir?: string): Promise<ScriptExecutionResult> {
		return this.execute({ script, workingDir });
	}
}
