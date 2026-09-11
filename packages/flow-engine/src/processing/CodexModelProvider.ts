/**
 * CodexModelProvider -- implements ModelProvider for the Codex CLI.
 *
 * Invocation: codex exec [message] --json [--auto] [-m model]
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
	// commandParts[1..] are prefix args (e.g. ['node', '/path/mock.mjs'] → command='node', prefix=['mock.mjs'])
	const args: string[] = [...commandParts.slice(1), 'exec'];

	// Codex exec requires the prompt as a positional arg
	if (options.prompt) {
		args.push(options.prompt);
	}

	// --json flag (codex uses --json instead of --format json)
	args.push('--json');

	// --auto enables auto-approval of permissions
	if (options.skipPermissions === true) {
		args.push('--auto');
	}

	// -m provider/model
	if (options.model) {
		args.push('-m', options.model);
	}

	// --resume sessionId
	if (options.resumeSessionId) {
		args.push('--resume', options.resumeSessionId);
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

		const { parts, needsShell } = this.findCodexCommand();
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

		const { parts, needsShell } = this.findCodexCommand();
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
				let costUsd = 0;
				let inputTokens = 0;
				let outputTokens = 0;
				let firstStepStartFired = false;

				const processLine = (line: string): void => {
					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(line) as Record<string, unknown>;
					} catch {
						return;
					}

					const eventType = parsed['type'] as string | undefined;
					const sessionID = parsed['sessionID'] as string | undefined;

					// Capture sessionID from any event
					if (sessionID && !capturedSessionId) {
						capturedSessionId = sessionID;
					}

					if (eventType === 'step_start' && !firstStepStartFired) {
						firstStepStartFired = true;
						const initEvent: StreamJsonEvent = {
							type: 'system',
							subtype: 'init',
							data: {
								session_id: capturedSessionId,
								model: options.model ?? 'codex',
							},
						};
						options.onStreamEvent?.(initEvent);
					} else if (eventType === 'text') {
						const part = parsed['part'] as Record<string, unknown> | undefined;
						const text = part?.['text'] as string | undefined;
						if (text) {
							responseText += text;
							if (options.onStreamEvent) {
								options.onStreamEvent({
									type: 'text',
									subtype: 'text',
									data: { text },
								});
							}
						}
					} else if (eventType === 'tool_use') {
						const part = parsed['part'] as Record<string, unknown> | undefined;
						const state = part?.['state'] as Record<string, unknown> | undefined;
						if (state && options.onStreamEvent) {
							const toolEvent: StreamJsonEvent = {
								type: 'tool_use',
								subtype: 'tool_use',
								data: {
									tool: (part?.['tool'] as string | undefined) ?? '',
									callID: (part?.['callID'] as string | undefined) ?? '',
									input: state['input'],
									output: (state['output'] as string | undefined) ?? '',
									status: (state['status'] as string | undefined) ?? '',
								},
							};
							options.onStreamEvent(toolEvent);
						}
					} else if (eventType === 'step_finish') {
						const part = parsed['part'] as Record<string, unknown> | undefined;
						if (part?.['reason'] === 'stop') {
							costUsd += (part['cost'] as number | undefined) ?? 0;
							const tokens = part['tokens'] as Record<string, unknown> | undefined;
							inputTokens += (tokens?.['input'] as number | undefined) ?? 0;
							outputTokens += (tokens?.['output'] as number | undefined) ?? 0;
						}
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

					if (options.onStreamEvent && firstStepStartFired) {
						const resultEvent: StreamJsonEvent = {
							type: 'result',
							subtype: 'result',
							data: {
								result: responseText,
								cost_usd: costUsd,
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

					resolve({ stdout, stderr, exitCode: code ?? -1 });
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
			console.warn('[CodexModelProvider] kill() failed:', err instanceof Error ? String(err) : String(err));
		}
	}

	/**
	 * Resolve the codex binary path.
	 * CODEX_MOCK_PATH env var overrides path resolution -- used in tests.
	 */
	private findCodexCommand(): { parts: string[]; needsShell: boolean } {
		const mockPath = process.env['CODEX_MOCK_PATH'];
		if (mockPath) {
			if (mockPath.endsWith('.mjs') || mockPath.endsWith('.js')) {
				return { parts: ['node', mockPath], needsShell: false };
			}
			return { parts: [mockPath], needsShell: false };
		}
		if (process.platform === 'win32') {
			// On Windows, find the real codex.exe
			try {
				const cmdPath = execSync('where.exe codex.cmd', { encoding: 'utf8', windowsHide: true })
					.trim()
					.split('\n')[0]!
					.trim();
				const dir = path.dirname(cmdPath);
				const exePath = path.join(dir, 'node_modules', 'codex-ai', 'bin', 'codex.exe');
				if (fs.existsSync(exePath)) {
					return { parts: [exePath], needsShell: false };
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
			path.join(os.homedir(), '.config', 'codex', 'config.json'),
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
