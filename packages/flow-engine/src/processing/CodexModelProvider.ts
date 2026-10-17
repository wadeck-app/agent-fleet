/**
 * CodexModelProvider -- implements ModelProvider for the Codex CLI.
 *
 * Invocation: codex exec [resume <threadId>] [message] --json [--approve-for-me | --sandbox read-only] [-m model]
 * Output: real codex JSONL (thread.started / item.completed / turn.completed ...), see codex-mock.mjs
 * MCP config: Same as OpenCode (OPENCODE_CONFIG_CONTENT or OPENCODE_CONFIG)
 * Env isolation: only options.env is forwarded; process.env is never inherited.
 * Prompt limit: 32KB -- throws PromptTooLargeError if exceeded.
 * XDG isolation: each subprocess gets a unique XDG_CONFIG_HOME.
 */
import { type ChildProcess, execSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type {
	LaunchOptions,
	McpServer,
	ModelBackgroundResult,
	ModelInteractiveResult,
	ModelProvider,
} from './ModelProvider';
import { PromptTooLargeError, validateLaunchOptions } from './ModelProvider';
import { OpenCodeHookTranslator } from './OpenCodeHookTranslator';
import type { StreamJsonEvent } from './StreamJsonParser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PROMPT_BYTES = 32 * 1024; // 32KB
const DEFAULT_MAX_INLINE_CONFIG_BYTES = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// Runtime type guards for untyped JSON boundaries
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown JSON value to a plain object.
 * Arrays and null are rejected -- they never carry the keys we read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// MCP config builder (reuse OpenCode format)
// ---------------------------------------------------------------------------

/**
 * Build Codex MCP config JSON from McpServer[].
 * Codex uses the same config format as OpenCode.
 */
function buildCodexConfig(servers: McpServer[], pluginPath?: string): Record<string, unknown> {
	const mcp: Record<string, unknown> = {};
	for (const s of servers) {
		const entry: Record<string, unknown> = {
			type: 'local',
			command: s.command.map(cmd => cmd.replace(/\\/g, '/')),
			enabled: s.enabled ?? true,
		};
		if (s.env && Object.keys(s.env).length > 0) {
			entry['environment'] = s.env;
		}
		if (s.cwd) {
			entry['cwd'] = s.cwd.replace(/\\/g, '/');
		}
		mcp[s.name] = entry;
	}
	const config: Record<string, unknown> = { mcp };
	if (pluginPath) {
		config['plugin'] = [pluginPath.replace(/\\/g, '/')];
	}
	return config;
}

// ---------------------------------------------------------------------------
// Spawn params builder
// ---------------------------------------------------------------------------

interface SpawnParams {
	command: string;
	args: string[];
	env: Record<string, string>;
	tempFile?: string;
	shell: boolean;
}

function buildSpawnParams(
	options: LaunchOptions,
	interactive: boolean,
	commandParts: string[],
	needsShell: boolean,
	maxInlineConfigBytes: number,
	pluginPath?: string
): SpawnParams {
	const command = commandParts[0]!;
	// commandParts[1..] are prefix args (e.g. ['node', '/path/mock.mjs'] -> command='node', prefix=['mock.mjs'])
	const args: string[] = [...commandParts.slice(1), 'exec'];

	// Resuming is a subcommand, not a flag: `codex exec resume <sessionId> [prompt]`. It has to
	// come before the prompt, since both are positionals. Verified against the installed codex:
	// `codex exec resume --help` documents [SESSION_ID] [PROMPT] in that order, and the old
	// `--resume <id>` flag is rejected.
	if (options.resumeSessionId) {
		args.push('resume', options.resumeSessionId);
	}

	// Codex exec requires the prompt as a positional arg
	if (options.prompt) {
		args.push(options.prompt);
	}

	// --json flag (codex uses --json instead of --format json)
	args.push('--json');

	// Always skip git repo check -- flow can be run from any directory
	args.push('--skip-git-repo-check');

	// Codex has no per-tool allow-list -- only a sandbox level. The one case we can map
	// faithfully is "no file writes, no shell commands": excluding both from `tools` gets
	// `--sandbox read-only`. Any other combination (e.g. allowing bash but not write) has no
	// Codex equivalent and is left at Codex's own default, deliberately -- a wrong guess here
	// would be a silent under-restriction, which is worse than not restricting at all.
	const readOnly = options.tools !== undefined && !options.tools.includes('write') && !options.tools.includes('bash');

	// Approve without prompting. `--auto` does not exist in codex -- sending it exited on a
	// usage error -- and `--approve-for-me` is the flag that does this while keeping the
	// workspace-write sandbox. The full escape hatch is
	// `--dangerously-bypass-approvals-and-sandbox`, deliberately not used here: it drops the
	// sandbox too, which is more than a step asking not to be prompted has asked for.
	// `--approve-for-me` conflicts with `--sandbox` (codex exits 2: "cannot be used with"), and
	// it implies workspace-write. Read-only is the stricter request, so it wins; a read-only
	// sandbox has no writes or commands left to approve.
	if (readOnly) {
		args.push('--sandbox', 'read-only');
	} else if (options.skipPermissions === true) {
		args.push('--approve-for-me');
	}

	// -m provider/model
	if (options.model) {
		args.push('-m', options.model);
	}

	// Env isolation: forward infrastructure env vars
	const infraEnv: Record<string, string> = {};
	if (process.env['PATH']) infraEnv['PATH'] = process.env['PATH']!;
	if (process.env['HOME']) infraEnv['HOME'] = process.env['HOME']!;
	if (process.env['USERPROFILE']) infraEnv['USERPROFILE'] = process.env['USERPROFILE']!;
	if (process.env['SystemRoot']) infraEnv['SystemRoot'] = process.env['SystemRoot']!;
	const env: Record<string, string> = { ...infraEnv, ...(options.env ?? {}) };

	// Serialize McpServers and/or plugin into config
	let tempFile: string | undefined;
	const hasServers = options.mcpServers && options.mcpServers.length > 0;
	if (hasServers || pluginPath) {
		const config = buildCodexConfig(options.mcpServers ?? [], pluginPath);
		const json = JSON.stringify(config);
		const jsonBytes = Buffer.byteLength(json, 'utf8');

		if (jsonBytes > maxInlineConfigBytes) {
			// Write temp file; set CODEX_CONFIG env var (or reuse OPENCODE_CONFIG for compatibility)
			tempFile = path.join(os.tmpdir(), `codex-config-${crypto.randomUUID()}.json`);
			fs.writeFileSync(tempFile, json, { encoding: 'utf8' });
			try {
				fs.chmodSync(tempFile, 0o600);
			} catch {
				// best-effort; non-fatal on Windows
			}
			// Codex may use OPENCODE_CONFIG or CODEX_CONFIG -- use both for compatibility
			env['CODEX_CONFIG'] = tempFile;
			env['OPENCODE_CONFIG'] = tempFile;
		} else {
			// Inline config
			env['CODEX_CONFIG_CONTENT'] = json;
			env['OPENCODE_CONFIG_CONTENT'] = json;
		}
	}

	return { command, args, env, tempFile, shell: needsShell };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface CodexModelProviderOptions {
	maxInlineConfigBytes?: number;
}

export class CodexModelProvider implements ModelProvider {
	private currentProcess: ChildProcess | null = null;
	private readonly maxInlineConfigBytes: number;

	constructor(options: CodexModelProviderOptions = {}) {
		this.maxInlineConfigBytes = options.maxInlineConfigBytes ?? DEFAULT_MAX_INLINE_CONFIG_BYTES;
	}

	public async launchInteractive(options: LaunchOptions): Promise<ModelInteractiveResult> {
		validateLaunchOptions(options);

		// Each subprocess gets an isolated XDG_CONFIG_HOME
		const tempDir = path.join(os.tmpdir(), `codex-run-${crypto.randomUUID()}`);
		fs.mkdirSync(tempDir, { recursive: true });
		this.copyGlobalConfig(tempDir);

		// Write plugin hook file if hooks are requested
		let pluginPath: string | undefined;
		if (options.toolHooks && options.toolHooks.length > 0) {
			pluginPath = path.join(tempDir, 'hook.js');
			fs.writeFileSync(pluginPath, OpenCodeHookTranslator.toPluginJs(options.toolHooks), { encoding: 'utf8' });
		}

		const { parts, needsShell } = this.findCodexCommand({ ...process.env, ...(options.env ?? {}) });
		const { command, args, env, tempFile, shell } = buildSpawnParams(
			options,
			true,
			parts,
			needsShell,
			this.maxInlineConfigBytes,
			pluginPath
		);

		env['XDG_CONFIG_HOME'] = tempDir;

		try {
			return await new Promise<ModelInteractiveResult>((resolve, reject) => {
				// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so grandchildren (the codex CLI's own child processes) allocate a visible console; this stdio:'inherit' spawn must inherit the daemon's hidden console (d032e7e)
				const proc = spawn(command, args, {
					cwd: options.workingDir,
					stdio: 'inherit',
					shell,
					env,
				});
				this.currentProcess = proc;
				options.onProcessStarted?.(proc);

				proc.on('exit', code => {
					this.currentProcess = null;
					resolve({ response: '', exitCode: code });
				});
				proc.on('error', reject);
			});
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupTempFile(tempFile);
			this.cleanupTempDir(tempDir);
		}
	}

	public async launchBackground(options: LaunchOptions): Promise<ModelBackgroundResult> {
		validateLaunchOptions(options);

		const promptBytes = Buffer.byteLength(options.prompt, 'utf8');
		if (promptBytes > MAX_PROMPT_BYTES) {
			throw new PromptTooLargeError(promptBytes, MAX_PROMPT_BYTES);
		}

		// Each subprocess gets an isolated XDG_CONFIG_HOME
		const tempDir = path.join(os.tmpdir(), `codex-run-${crypto.randomUUID()}`);
		fs.mkdirSync(tempDir, { recursive: true });
		this.copyGlobalConfig(tempDir);

		// Write plugin hook file if hooks are requested
		let pluginPath: string | undefined;
		if (options.toolHooks && options.toolHooks.length > 0) {
			pluginPath = path.join(tempDir, 'hook.js');
			fs.writeFileSync(pluginPath, OpenCodeHookTranslator.toPluginJs(options.toolHooks), { encoding: 'utf8' });
		}

		const { parts, needsShell } = this.findCodexCommand({ ...process.env, ...(options.env ?? {}) });
		const { command, args, env, tempFile, shell } = buildSpawnParams(
			options,
			false,
			parts,
			needsShell,
			this.maxInlineConfigBytes,
			pluginPath
		);

		env['XDG_CONFIG_HOME'] = tempDir;

		try {
			return await new Promise<ModelBackgroundResult>((resolve, reject) => {
				const launchStartTime = Date.now();

				const proc = spawn(command, args, {
					cwd: options.workingDir,
					stdio: ['ignore', 'pipe', 'pipe'],
					shell,
					windowsHide: true,
					env,
				});
				this.currentProcess = proc;
				options.onProcessStarted?.(proc);

				let stdout = '';
				let stderr = '';
				let lineBuffer = '';
				let responseText = '';
				let capturedSessionId = '';
				let inputTokens = 0;
				let outputTokens = 0;
				let initFired = false;
				const failureMessages: string[] = [];
				const warnedUnknown = new Set<string>();

				const warnUnknown = (kind: string): void => {
					if (warnedUnknown.has(kind)) return;
					warnedUnknown.add(kind);
					console.warn(
						`[CodexModelProvider] unrecognized codex event "${kind}" ignored -- the codex JSONL schema may have changed; run StepRunner.codex.integration.test with CODEX_INTEGRATION=1`
					);
				};

				// Event schema verified against codex-cli 0.163.0 (see codex-mock.mjs and
				// StepRunner.codex.integration.test.ts). Real codex reports no cost, so cost stays 0.
				const processLine = (line: string): void => {
					let raw: unknown;
					try {
						raw = JSON.parse(line);
					} catch {
						return;
					}
					// Non-object JSON lines (arrays, numbers, strings) carry none of the event keys we read
					if (!isRecord(raw)) {
						return;
					}
					const parsed = raw;
					const eventType = parsed['type'];

					switch (eventType) {
						case 'thread.started': {
							const threadId = parsed['thread_id'];
							if (typeof threadId === 'string' && threadId && !capturedSessionId) {
								capturedSessionId = threadId;
							}
							if (!initFired) {
								initFired = true;
								const initEvent: StreamJsonEvent = {
									type: 'system',
									subtype: 'init',
									data: {
										session_id: capturedSessionId,
										model: options.model ?? 'codex',
									},
								};
								options.onStreamEvent?.(initEvent);
							}
							break;
						}
						case 'turn.started':
						case 'item.started':
							// item.started carries no information item.completed does not repeat.
							break;
						case 'item.completed': {
							const item = isRecord(parsed['item']) ? parsed['item'] : undefined;
							const itemType = item?.['type'];
							if (itemType === 'agent_message') {
								const text = item?.['text'];
								if (typeof text === 'string' && text) {
									responseText += text;
									options.onStreamEvent?.({ type: 'text', subtype: 'text', data: { text } });
								}
							} else if (itemType === 'command_execution') {
								options.onStreamEvent?.({
									type: 'tool_use',
									subtype: 'tool_use',
									data: {
										tool: 'command_execution',
										callID: typeof item?.['id'] === 'string' ? item['id'] : '',
										input: { command: item?.['command'] },
										output:
											typeof item?.['aggregated_output'] === 'string'
												? item['aggregated_output']
												: '',
										status: typeof item?.['status'] === 'string' ? item['status'] : '',
									},
								});
							} else if (itemType === 'error') {
								// Non-fatal diagnostics (e.g. ignored config settings): codex still exits 0.
								const message = item?.['message'];
								console.warn(
									`[CodexModelProvider] codex reported: ${typeof message === 'string' ? message : '(no message)'}`
								);
							} else {
								warnUnknown(`item.completed/${String(itemType)}`);
							}
							break;
						}
						case 'turn.completed': {
							const usage = isRecord(parsed['usage']) ? parsed['usage'] : undefined;
							inputTokens += typeof usage?.['input_tokens'] === 'number' ? usage['input_tokens'] : 0;
							outputTokens += typeof usage?.['output_tokens'] === 'number' ? usage['output_tokens'] : 0;
							break;
						}
						case 'error': {
							// Intermediate (e.g. "Reconnecting... 1/5"); the terminal outcome is turn.failed.
							break;
						}
						case 'turn.failed': {
							const error = isRecord(parsed['error']) ? parsed['error'] : undefined;
							const message = error?.['message'];
							failureMessages.push(
								typeof message === 'string' ? message : 'codex turn failed (no message)'
							);
							break;
						}
						default:
							warnUnknown(String(eventType));
					}
				};

				const flushLineBuffer = (): void => {
					const remaining = lineBuffer.trim();
					if (remaining) {
						processLine(remaining);
					}
					lineBuffer = '';
				};

				proc.stdout?.on('data', (data: Buffer) => {
					const chunk = data.toString();
					stdout += chunk;
					lineBuffer += chunk;

					let newlineIdx: number;
					while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
						const line = lineBuffer.substring(0, newlineIdx).trim();
						lineBuffer = lineBuffer.substring(newlineIdx + 1);
						if (line) {
							processLine(line);
						}
					}
				});

				proc.stderr?.on('data', (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on('exit', code => {
					this.currentProcess = null;
					flushLineBuffer();

					if (options.onStreamEvent && initFired) {
						const resultEvent: StreamJsonEvent = {
							type: 'result',
							subtype: 'result',
							data: {
								result: responseText,
								// codex reports no cost
								cost_usd: 0,
								duration_ms: Date.now() - launchStartTime,
								modelUsage: {
									codex: {
										inputTokens,
										outputTokens,
									},
								},
							},
						};
						options.onStreamEvent(resultEvent);
					}

					// Real codex writes the failure reason only to the JSONL stream (stderr stays empty), so surface it
					// where callers look for an actionable error.
					const failureSuffix = failureMessages.map(m => `codex: ${m}`).join('\n');
					const separator = stderr && !stderr.endsWith('\n') ? '\n' : '';
					resolve({
						stdout,
						stderr: failureSuffix ? `${stderr}${separator}${failureSuffix}` : stderr,
						exitCode: code ?? -1,
					});
				});
				proc.on('error', reject);
			});
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupTempFile(tempFile);
			this.cleanupTempDir(tempDir);
		}
	}

	public kill(): void {
		try {
			if (this.currentProcess) {
				this.currentProcess.kill();
			}
		} catch (err) {
			console.warn('[CodexModelProvider] kill() failed:', normalizeError(err).message);
		}
	}

	/**
	 * Resolve the codex binary path.
	 * CODEX_MOCK_PATH env var overrides path resolution -- used in tests, and in a per-step
	 * mock-config overlay (checked via `env`, which already carries options.env, before process.env).
	 */
	private findCodexCommand(env: NodeJS.ProcessEnv = process.env): { parts: string[]; needsShell: boolean } {
		const mockPath = env['CODEX_MOCK_PATH'];
		if (mockPath) {
			if (mockPath.endsWith('.mjs') || mockPath.endsWith('.js')) {
				return { parts: ['node', mockPath], needsShell: false };
			}
			return { parts: [mockPath], needsShell: false };
		}
		if (process.platform === 'win32') {
			// On Windows, codex.cmd is a Node.js wrapper: node @openai/codex/bin/codex.js
			// Spawn node + codex.js directly to avoid shell-splitting the prompt args
			try {
				// "2>nul" discards at the shell level -- where.exe writes its localized "could not
				// find files" message straight to the console on a miss, bypassing stdio redirection.
				const cmdPath = execSync('where.exe codex.cmd 2>nul', { encoding: 'utf8', windowsHide: true })
					.trim()
					.split('\n')[0]!
					.trim();
				const dir = path.dirname(cmdPath);
				const codexJs = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
				if (fs.existsSync(codexJs)) {
					return { parts: [process.execPath, codexJs], needsShell: false };
				}
			} catch {
				// fall through to shell:true fallback
			}
			return { parts: ['codex'], needsShell: true };
		}
		try {
			return {
				parts: [execSync('which codex', { encoding: 'utf8', windowsHide: true }).trim()],
				needsShell: false,
			};
		} catch {
			return { parts: ['codex'], needsShell: false };
		}
	}

	private cleanupTempFile(filePath: string | undefined): void {
		if (!filePath) return;
		try {
			fs.unlinkSync(filePath);
		} catch {
			// non-fatal
		}
	}

	private cleanupTempDir(dirPath: string): void {
		try {
			fs.rmSync(dirPath, { recursive: true, force: true });
		} catch {
			// non-fatal
		}
	}

	/**
	 * Copy the user's global Codex config into the isolated tempDir.
	 * Codex may use the same config locations as OpenCode or its own.
	 */
	private copyGlobalConfig(tempDir: string): void {
		const candidates = [
			// violations-suppress: shared/no-out-of-repo-path reads the codex CLI's own global config under the user's home; that path is owned by the external CLI, not by this repo
			path.join(os.homedir(), '.config', 'codex', 'config.json'),
			// violations-suppress: shared/no-out-of-repo-path falls back to the opencode CLI's global config under the user's home; that path is owned by the external CLI, not by this repo
			path.join(os.homedir(), '.config', 'opencode', 'config.json'),
			...(process.env['LOCALAPPDATA'] ? [path.join(process.env['LOCALAPPDATA'], 'codex', 'config.json')] : []),
			...(process.env['APPDATA'] ? [path.join(process.env['APPDATA'], 'codex', 'config.json')] : []),
		];
		const src = candidates.find(p => fs.existsSync(p));
		if (!src) return;
		const destDir = path.join(tempDir, 'codex');
		fs.mkdirSync(destDir, { recursive: true });
		fs.copyFileSync(src, path.join(destDir, 'config.json'));
	}
}
