/**
 * Claude Launcher
 *
 * Launches and executes Claude Code processes in:
 * - Interactive mode (stdio: inherit, terminal takeover)
 * - Background mode (capture stdout/stderr)
 */
import { DefaultProcessLauncher } from './DefaultProcessLauncher';
import type { ProcessLauncher } from './ProcessLauncher';
import { type StreamJsonEvent, type StreamJsonEventCallback, StreamJsonParser } from './StreamJsonParser';
import { type ToolName, buildClaudeToolsArg } from './ToolAccess';

/**
 * How long a claude process may keep running after its final `result` event before it is ended.
 *
 * The real CLI waits for pending background tasks after the final answer and can stay alive far longer
 * than the turn; 30 s leaves room for a follow-up turn announced by such a task before giving up.
 */
export const DEFAULT_RESULT_GRACE_MS = 30_000;

/**
 * Result from launching Claude in interactive mode
 */
export interface ClaudeInteractiveResult {
	response: string;
	exitCode: number | null;
}

/**
 * Result from launching Claude in background mode
 */
export interface ClaudeBackgroundResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	/**
	 * Present when the process was still running `graceMs` after its final `result` event and was
	 * terminated by the launcher; `exitCode` is then 0 (1 when that result was an error), not the
	 * exit code of the killed process.
	 */
	endedAfterResult?: { graceMs: number };
}

/**
 * Options for launching Claude
 */
export interface ClaudeLaunchOptions {
	/** Working directory */
	workingDir: string;

	/** Prompt to send to Claude */
	prompt: string;

	/** Step ID */
	stepId: string;

	/** Model to use (optional) */
	model?: string;

	/** Environment variables for Claude */
	env?: Record<string, string>;

	/** Path to MCP config JSON file -- passed as --mcp-config <path> */
	mcpConfigPath?: string;

	/** Path to Claude settings JSON file -- passed as --settings <path>; also adds --include-hook-events */
	settingsPath?: string;

	/** Callback when process starts */
	onProcessStarted?: (process: import('node:child_process').ChildProcess) => void;

	/** Enable --output-format stream-json */
	streamJson?: boolean;

	/** Enable --verbose flag */
	verbose?: boolean;

	/** Enable --dangerously-skip-permissions (default: false, explicit opt-in required) */
	skipPermissions?: boolean;

	/** Restricts the model to these tools via --tools. Omit for no restriction. @see ToolAccess */
	tools?: ToolName[];

	/** Resume a previous Claude session by ID (passes --resume <id> before -p) */
	resumeSessionId?: string;

	/** Pass --auto-compact to trigger context compaction before the response (compact mode) */
	autoCompact?: boolean;

	/** Callback for stream-json events (requires streamJson=true) */
	onStreamEvent?: StreamJsonEventCallback;

	/**
	 * Background mode with streamJson only: milliseconds a process may keep running after its `result`
	 * event (and after any later event) before it is terminated with its whole process tree.
	 * Default {@link DEFAULT_RESULT_GRACE_MS}. Must be positive.
	 */
	resultGraceMs?: number;

	/**
	 * When true (default), claude subprocess only receives PATH, ANTHROPIC_API_KEY,
	 * HOME, and any explicitly passed env vars. No other credentials leak.
	 * Set to false only when full env inheritance is explicitly required.
	 */
	isolateEnv?: boolean;
}

/**
 * Claude Launcher
 */
export class ClaudeLauncher {
	/** Every process this class starts, ends or looks up goes through the launcher (default: the host). */
	constructor(private readonly processLauncher: ProcessLauncher = new DefaultProcessLauncher()) {}

	/**
	 * Find Claude executable path
	 */
	public findClaudePath(env: NodeJS.ProcessEnv = process.env): string {
		// Allow tests -- and a per-step mock-config overlay (options.env) -- to inject a mock Claude binary
		if (env['CLAUDE_MOCK_PATH']) {
			return env['CLAUDE_MOCK_PATH'];
		}
		try {
			if (process.platform === 'win32') {
				const result = this.processLauncher.lookupExecutable('where claude');
				const paths = result.split('\n').map(p => p.trim());
				const cmdPath = paths.find(p => p.endsWith('.cmd'));
				if (cmdPath) {
					return cmdPath;
				}
				const batPath = paths.find(p => p.endsWith('.bat'));
				if (batPath) {
					return batPath;
				}
				return paths[0];
			} else {
				return this.processLauncher.lookupExecutable('which claude');
			}
		} catch {
			console.warn('Could not find claude in PATH, using "claude" as fallback');
			return 'claude';
		}
	}

	/**
	 * Launch Claude in interactive mode
	 */
	public async launchInteractive(options: ClaudeLaunchOptions): Promise<ClaudeInteractiveResult> {
		const claudePath = this.findClaudePath({ ...process.env, ...(options.env ?? {}) });
		const { command, args } = this.buildCommand(
			claudePath,
			options.prompt,
			options.model,
			true, // interactive
			options
		);

		console.log(`\n Launching Claude (${options.model || 'default'}) in interactive mode...`);
		console.log(` Prompt: ${options.prompt.substring(0, 100)}${options.prompt.length > 100 ? '...' : ''}\n`);

		return this.executeInteractive(command, args, options);
	}

	/**
	 * Launch Claude in background mode
	 */
	public async launchBackground(options: ClaudeLaunchOptions): Promise<ClaudeBackgroundResult> {
		if (options.resultGraceMs !== undefined && !(options.resultGraceMs > 0)) {
			throw new Error(
				`Invalid resultGraceMs ${String(options.resultGraceMs)} for step ${options.stepId}: it must be a positive number of milliseconds (default ${String(DEFAULT_RESULT_GRACE_MS)}).`
			);
		}
		const claudePath = this.findClaudePath({ ...process.env, ...(options.env ?? {}) });

		const { command, args } = this.buildCommand(
			claudePath,
			options.prompt,
			options.model,
			false, // background
			options
		);

		console.log(`Launching Claude (${options.model || 'default'}) in background mode...`);

		return await this.executeBackground(command, args, options);
	}

	/**
	 * Build command and args for launching Claude
	 */
	private buildCommand(
		claudePath: string,
		prompt: string,
		model: string | undefined,
		interactive: boolean,
		options?: Pick<
			ClaudeLaunchOptions,
			| 'skipPermissions'
			| 'streamJson'
			| 'verbose'
			| 'resumeSessionId'
			| 'autoCompact'
			| 'mcpConfigPath'
			| 'settingsPath'
			| 'tools'
		>
	): { command: string; args: string[] } {
		let command: string;
		let args: string[];

		// --dangerously-skip-permissions requires explicit opt-in (default: false)
		const skipPermissions = options?.skipPermissions === true;

		if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
			command = 'cmd.exe';
			args = ['/c', claudePath];
		} else if (claudePath.endsWith('.mjs') || claudePath.endsWith('.js')) {
			// .mjs/.js files are not directly executable on Windows -- run via node
			command = process.execPath;
			args = [claudePath];
		} else {
			command = claudePath;
			args = [];
		}

		if (options?.mcpConfigPath) {
			args.push('--mcp-config', options.mcpConfigPath);
		}

		if (options?.settingsPath) {
			args.push('--settings', options.settingsPath);
			args.push('--include-hook-events');
		}

		if (skipPermissions) {
			args.push('--dangerously-skip-permissions');
		}

		// "" disables all tools (confirmed via `claude --help`); a non-empty list restricts to
		// exactly those names. Omitting `tools` leaves Claude's own default untouched.
		if (options?.tools !== undefined) {
			args.push('--tools', buildClaudeToolsArg(options.tools));
		}

		if (options?.streamJson) {
			// Claude refuses this combination outright: "When using --print,
			// --output-format=stream-json requires --verbose" (verified on 2.1.270). Emitting it
			// anyway means the step dies on a usage error with no events, so the contradiction is
			// reported here where the caller can see which setting to change.
			if (options.verbose === false) {
				throw new Error(
					'This step asks for stream-json output with verbose disabled, which claude rejects: --output-format=stream-json requires --verbose. Remove "verbose: false" from the step, or set "streamJson: false" to use plain output.'
				);
			}
			args.push('--output-format', 'stream-json');
		}

		if (options?.verbose) {
			args.push('--verbose');
		}

		if (model) {
			args.push('--model', model);
		}

		if (options?.autoCompact) {
			args.push('--autocompact', 'auto');
		}

		if (options?.resumeSessionId) {
			args.push('--resume', options.resumeSessionId);
		}

		if (interactive) {
			// Interactive mode: pass prompt as positional arg
			args.push(prompt);
		} else {
			// Background mode: prompt piped via stdin, -p for print mode
			args.push('-p');
		}

		return { command, args };
	}

	/**
	 * Execute Claude in interactive mode
	 */
	private async executeInteractive(
		command: string,
		args: string[],
		options: ClaudeLaunchOptions
	): Promise<ClaudeInteractiveResult> {
		return new Promise((resolve, reject) => {
			const shouldIsolate = options.isolateEnv !== false; // default true
			const baseEnvInteractive: NodeJS.ProcessEnv = shouldIsolate
				? {
						PATH: process.env['PATH'],
						HOME: process.env['HOME'],
						// Claude requires ANTHROPIC_API_KEY -- pass it explicitly
						...(process.env['ANTHROPIC_API_KEY']
							? { ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] }
							: {}),
						// Windows
						...(process.platform === 'win32' && process.env['SystemRoot']
							? { SystemRoot: process.env['SystemRoot'] }
							: {}),
						...(process.platform === 'win32' && process.env['USERPROFILE']
							? { USERPROFILE: process.env['USERPROFILE'] }
							: {}),
					}
				: { ...process.env };
			const rawEnvInteractive = { ...baseEnvInteractive, ...(options.env ?? {}) };
			const processEnvInteractive: Record<string, string> = {};
			for (const [k, v] of Object.entries(rawEnvInteractive)) {
				if (v !== undefined) {
					processEnvInteractive[k] = v;
				}
			}
			// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so grandchildren allocate a visible console; this spawn must inherit the daemon's hidden console (d032e7e). Guarded by ClaudeLauncher.windows-console.test.ts
			const claudeProcess = this.processLauncher.spawn(command, args, {
				cwd: options.workingDir,
				stdio: 'inherit',
				shell: false,
				env: processEnvInteractive,
			});

			// Call callback to store process reference
			if (options.onProcessStarted) {
				options.onProcessStarted(claudeProcess);
			}

			claudeProcess.on('close', code => {
				resolve({
					response: '', // Interactive mode doesn't capture output
					exitCode: code,
				});
			});

			claudeProcess.on('error', error => {
				reject(error);
			});
		});
	}

	/**
	 * Execute Claude in background mode
	 */
	private async executeBackground(
		command: string,
		args: string[],
		options: ClaudeLaunchOptions
	): Promise<ClaudeBackgroundResult> {
		return new Promise((resolve, reject) => {
			const shouldIsolate = options.isolateEnv !== false; // default true
			const baseEnvBackground: NodeJS.ProcessEnv = shouldIsolate
				? {
						PATH: process.env['PATH'],
						HOME: process.env['HOME'],
						// Claude requires ANTHROPIC_API_KEY -- pass it explicitly
						...(process.env['ANTHROPIC_API_KEY']
							? { ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] }
							: {}),
						// Windows
						...(process.platform === 'win32' && process.env['SystemRoot']
							? { SystemRoot: process.env['SystemRoot'] }
							: {}),
						...(process.platform === 'win32' && process.env['USERPROFILE']
							? { USERPROFILE: process.env['USERPROFILE'] }
							: {}),
					}
				: { ...process.env };
			const rawEnvBackground = { ...baseEnvBackground, ...(options.env ?? {}) };
			const processEnvBackground: Record<string, string> = {};
			for (const [k, v] of Object.entries(rawEnvBackground)) {
				if (v !== undefined) {
					processEnvBackground[k] = v;
				}
			}
			// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so grandchildren allocate a visible console; this spawn must inherit the daemon's hidden console (d032e7e). Guarded by ClaudeLauncher.windows-console.test.ts
			const claudeProcess = this.processLauncher.spawn(command, args, {
				cwd: options.workingDir,
				stdio: ['pipe', 'pipe', 'pipe'],
				shell: false,
				env: processEnvBackground,
			});

			// Call callback to store process reference
			if (options.onProcessStarted) {
				options.onProcessStarted(claudeProcess);
			}

			// Pipe prompt via stdin then close
			if (claudeProcess.stdin) {
				claudeProcess.stdin.write(options.prompt);
				claudeProcess.stdin.end();
			}

			let stdout = '';
			let stderr = '';

			const graceMs = options.resultGraceMs ?? DEFAULT_RESULT_GRACE_MS;
			let settled = false;
			let graceTimer: ReturnType<typeof setTimeout> | undefined;
			let lastResultIsError = false;

			const settle = (result: ClaudeBackgroundResult): void => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(graceTimer);
				resolve(result);
			};

			// The turn is over once `result` was seen, yet the CLI may keep running (it waits for background
			// tasks, e.g. a Bash call moved to the background). A child holding the stdio pipes then keeps
			// `close` from ever firing, so the process is ended here instead of leaving the step to the
			// daemon's silence watchdog.
			const endProcessAfterResult = (): void => {
				if (settled) {
					return;
				}
				const pid = claudeProcess.pid;
				const message = `Claude process ${pid === undefined ? '(no pid)' : String(pid)} (step ${options.stepId}) was ended after the final result because it kept running ${String(graceMs)} ms after it and emitted nothing more (likely held by a background task or child process).`;
				console.warn(`[Claude] ${message}`);
				if (pid !== undefined) {
					this.processLauncher.killTree(pid, 'SIGKILL');
				}
				// A grandchild that outlived the kill must not keep this launch pending through the pipes.
				claudeProcess.stdout?.destroy();
				claudeProcess.stderr?.destroy();
				parser?.flush();
				settle({
					stdout,
					stderr,
					// The turn completed; the exit code of a process we killed says nothing about it.
					exitCode: lastResultIsError ? 1 : 0,
					endedAfterResult: { graceMs },
				});
			};

			// Armed by `result`. Real turn activity (assistant/user) means a follow-up turn started: the
			// wait is cancelled until its own `result`. Any other event only restarts the wait.
			const observeForEndOfTurn = (event: StreamJsonEvent): void => {
				if (event.type === 'result') {
					lastResultIsError = event.data['is_error'] === true;
					clearTimeout(graceTimer);
					graceTimer = setTimeout(endProcessAfterResult, graceMs);
				} else if (graceTimer !== undefined) {
					clearTimeout(graceTimer);
					graceTimer = undefined;
					if (event.type !== 'assistant' && event.type !== 'user') {
						graceTimer = setTimeout(endProcessAfterResult, graceMs);
					}
				}
			};

			// Parse NDJSON in real-time when stream-json is enabled: the end of the turn is detected from it
			// even when the caller wants no events.
			const parser = options.streamJson
				? new StreamJsonParser(event => {
						observeForEndOfTurn(event);
						options.onStreamEvent?.(event);
					})
				: null;

			claudeProcess.stdout?.on('data', data => {
				const output = data.toString();
				stdout += output;

				if (parser) {
					parser.feed(output);
				}
				if (!(parser && options.onStreamEvent)) {
					console.log(`[Claude] ${output.trim()}`);
				}
			});

			claudeProcess.stderr?.on('data', data => {
				const output = data.toString();
				stderr += output;
				console.error(`[Claude Error] ${output.trim()}`);
			});

			claudeProcess.on('close', code => {
				if (parser) {
					parser.flush();
				}

				settle({
					stdout,
					stderr,
					exitCode: code ?? -1,
				});
			});

			claudeProcess.on('error', error => {
				reject(error);
			});
		});
	}
}
