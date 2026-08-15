/**
 * Script Executor
 *
 * Executes shell scripts/commands and captures output.
 * Simple wrapper around child_process for flow steps.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
					? { SystemRoot: process.env['SystemRoot'] } : {}),
				...(process.platform === 'win32' && process.env['USERPROFILE']
					? { USERPROFILE: process.env['USERPROFILE'] } : {}),
			}
			: { ...process.env };
		const rawEnv = { ...baseEnv, ...options.env };
		const cleanEnv: Record<string, string> = {};
		for (const [k, v] of Object.entries(rawEnv)) {
			if (v !== undefined) cleanEnv[k] = v;
		}
		const shell = options.shell !== undefined ? options.shell : true;

		// Handle multiline scripts on Windows: cmd.exe cannot handle multi-line shell commands,
		// so we write them to a temp file and execute that instead.
		let scriptToExecute = options.script;
		let tempFilePath: string | null = null;
		const isWindows = process.platform === 'win32';
		const isMultiline = options.script.includes('\n') || options.script.includes('\r\n');

		if (isWindows && isMultiline && shell) {
			const tempDir = os.tmpdir();
			const timestamp = Date.now();
			const random = Math.random().toString(36).substring(7);

			// Detect `node -e "..."` pattern: cmd.exe cannot handle multi-line quoted strings,
			// so we extract the JS content and write it to a .js file instead of a .bat file.
			const nodeEMatch = /^node\s+-e\s+(["'])([\s\S]*?)\1\s*$/.exec(options.script.trim());
			if (nodeEMatch) {
				const jsContent = nodeEMatch[2];
				tempFilePath = path.join(tempDir, `agent-fleet-script-${timestamp}-${random}.js`);
				fs.writeFileSync(tempFilePath, jsContent, 'utf8');
				// Wrap in quotes to handle paths with spaces
				scriptToExecute = `node "${tempFilePath}"`;
			} else {
				// Generic multiline shell script: write to a .bat file
				// This is necessary because cmd.exe via spawn() only executes the first line
				tempFilePath = path.join(tempDir, `agent-fleet-script-${timestamp}-${random}.bat`);
				fs.writeFileSync(tempFilePath, `@echo off\r\n${options.script}`, 'utf8');
				scriptToExecute = tempFilePath;
			}
		}

		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let killed = false;

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

				reject(new ScriptExecutionError(`Failed to execute script: ${error.message}`, -1, stdout, stderr));
			});
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
			throw new ScriptExecutionError(
				`Script failed with exit code ${result.exitCode}`,
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
