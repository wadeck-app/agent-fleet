/**
 * Claude Launcher
 *
 * Launches and executes Claude Code processes in:
 * - Interactive mode (stdio: inherit, terminal takeover)
 * - Background mode (capture stdout/stderr)
 */
import { execSync, spawn } from 'child_process';

import { type StreamJsonEventCallback, StreamJsonParser } from './StreamJsonParser';

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

	/** Path to MCP config JSON file — passed as --mcp-config <path> */
	mcpConfigPath?: string;

	/** Callback when process starts */
	onProcessStarted?: (process: any) => void;

	/** Enable --output-format stream-json */
	streamJson?: boolean;

	/** Enable --verbose flag */
	verbose?: boolean;

	/** Enable --dangerously-skip-permissions (default: true) */
	skipPermissions?: boolean;

	/** Resume a previous Claude session by ID (passes --resume <id> before -p) */
	resumeSessionId?: string;

	/** Pass --auto-compact to trigger context compaction before the response (compact mode) */
	autoCompact?: boolean;

	/** Callback for stream-json events (requires streamJson=true) */
	onStreamEvent?: StreamJsonEventCallback;

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
	/**
	 * Find Claude executable path
	 */
	public findClaudePath(): string {
		// Allow tests to inject a mock Claude binary
		if (process.env['CLAUDE_MOCK_PATH']) {
			return process.env['CLAUDE_MOCK_PATH'];
		}
		try {
			if (process.platform === 'win32') {
				const result = execSync('where claude', { encoding: 'utf8' }).trim();
				const paths = result.split('\n').map(p => p.trim());
				const cmdPath = paths.find(p => p.endsWith('.cmd'));
				if (cmdPath) return cmdPath;
				const batPath = paths.find(p => p.endsWith('.bat'));
				if (batPath) return batPath;
				return paths[0];
			} else {
				return execSync('which claude', { encoding: 'utf8' }).trim();
			}
		} catch (error) {
			console.warn('Could not find claude in PATH, using "claude" as fallback');
			return 'claude';
		}
	}

	/**
	 * Launch Claude in interactive mode
	 */
	public async launchInteractive(options: ClaudeLaunchOptions): Promise<ClaudeInteractiveResult> {
		const claudePath = this.findClaudePath();
		const { command, args } = this.buildCommand(
			claudePath,
			options.prompt,
			options.model,
			true, // interactive
			options
		);

		console.log(`\n🤖 Launching Claude (${options.model || 'default'}) in interactive mode...`);
		console.log(`💬 Prompt: ${options.prompt.substring(0, 100)}${options.prompt.length > 100 ? '...' : ''}\n`);

		return this.executeInteractive(command, args, options);
	}

	/**
	 * Launch Claude in background mode
	 */
	public async launchBackground(options: ClaudeLaunchOptions): Promise<ClaudeBackgroundResult> {
		const claudePath = this.findClaudePath();

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
			'skipPermissions' | 'streamJson' | 'verbose' | 'resumeSessionId' | 'autoCompact' | 'mcpConfigPath'
		>
	): { command: string; args: string[] } {
		let command: string;
		let args: string[];

		// --dangerously-skip-permissions is enabled by default unless explicitly disabled
		const skipPermissions = options?.skipPermissions !== false;

		if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
			command = 'cmd.exe';
			args = ['/c', claudePath];
		} else {
			command = claudePath;
			args = [];
		}

		if (options?.mcpConfigPath) {
			args.push('--mcp-config', options.mcpConfigPath);
		}

		if (skipPermissions) {
			args.push('--dangerously-skip-permissions');
		}

		if (options?.streamJson) {
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
						// Claude requires ANTHROPIC_API_KEY — pass it explicitly
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
				if (v !== undefined) processEnvInteractive[k] = v;
			}
			const claudeProcess = spawn(command, args, {
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
						// Claude requires ANTHROPIC_API_KEY — pass it explicitly
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
				if (v !== undefined) processEnvBackground[k] = v;
			}
			const claudeProcess = spawn(command, args, {
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

			// When stream-json is enabled and a callback is provided, parse NDJSON in real-time
			const parser =
				options.streamJson && options.onStreamEvent ? new StreamJsonParser(options.onStreamEvent) : null;

			claudeProcess.stdout?.on('data', data => {
				const output = data.toString();
				stdout += output;

				if (parser) {
					parser.feed(output);
				} else {
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

				resolve({
					stdout,
					stderr,
					exitCode: code || 0,
				});
			});

			claudeProcess.on('error', error => {
				reject(error);
			});
		});
	}
}
