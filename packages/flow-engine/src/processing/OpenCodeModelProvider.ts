/**
 * OpenCodeModelProvider — implements ModelProvider for the OpenCode CLI.
 *
 * Invocation: opencode run [message] --format json [--auto] [-m model]
 * MCP config: OPENCODE_CONFIG_CONTENT (inline JSON ≤1MB) or OPENCODE_CONFIG (temp file >1MB)
 * Env isolation: only options.env is forwarded; process.env is never inherited.
 * Prompt limit: 32KB — throws PromptTooLargeError if exceeded.
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
import type { StreamJsonEvent } from './StreamJsonParser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PROMPT_BYTES = 32 * 1024; // 32KB
const DEFAULT_MAX_INLINE_CONFIG_BYTES = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// MCP config builder
// ---------------------------------------------------------------------------

/**
 * Build OpenCode MCP config JSON from McpServer[].
 * OpenCode expects: { mcp: { servers: { name: { type, command, args, env? } } } }
 */
function buildOpenCodeConfig(servers: McpServer[]): Record<string, unknown> {
	const serversMap: Record<string, unknown> = {};
	for (const s of servers) {
		const [command, ...args] = s.command;
		const entry: Record<string, unknown> = { type: 'stdio', command, args };
		if (s.env && Object.keys(s.env).length > 0) {
			entry['env'] = s.env;
		}
		if (s.cwd) {
			entry['cwd'] = s.cwd;
		}
		serversMap[s.name] = entry;
	}
	return { mcp: { servers: serversMap } };
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
	maxInlineConfigBytes: number
): SpawnParams {
	const command = commandParts[0]!;
	// commandParts[1..] are prefix args (e.g. ['node', '/path/mock.mjs'] → command='node', prefix=['mock.mjs'])
	const args: string[] = [...commandParts.slice(1), 'run'];

	// Prompt as positional arg (background mode only; interactive has no prompt)
	if (!interactive) {
		args.push(options.prompt);
	}

	// --format json (always required)
	args.push('--format', 'json');

	// --auto enables auto-approval of permissions (requires explicit opt-in, default: false)
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

	// Env isolation: forward only options.env; never inherit process.env
	const env: Record<string, string> = { ...(options.env ?? {}) };

	// Serialize McpServers
	let tempFile: string | undefined;
	if (options.mcpServers && options.mcpServers.length > 0) {
		const config = buildOpenCodeConfig(options.mcpServers);
		const json = JSON.stringify(config);
		const jsonBytes = Buffer.byteLength(json, 'utf8');

		if (jsonBytes > maxInlineConfigBytes) {
			// Write temp file; set OPENCODE_CONFIG env var
			tempFile = path.join(os.tmpdir(), `opencode-config-${crypto.randomUUID()}.json`);
			fs.writeFileSync(tempFile, json, { encoding: 'utf8' });
			try {
				fs.chmodSync(tempFile, 0o600);
			} catch {
				// best-effort; non-fatal on Windows
			}
			env['OPENCODE_CONFIG'] = tempFile;
		} else {
			// Inline; set OPENCODE_CONFIG_CONTENT env var (highest precedence)
			env['OPENCODE_CONFIG_CONTENT'] = json;
		}
	}

	return { command, args, env, tempFile, shell: needsShell };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OpenCodeModelProviderOptions {
	maxInlineConfigBytes?: number;
}

export class OpenCodeModelProvider implements ModelProvider {
	private currentProcess: ChildProcess | null = null;
	private readonly maxInlineConfigBytes: number;

	constructor(options: OpenCodeModelProviderOptions = {}) {
		this.maxInlineConfigBytes = options.maxInlineConfigBytes ?? DEFAULT_MAX_INLINE_CONFIG_BYTES;
	}

	public async launchInteractive(options: LaunchOptions): Promise<ModelInteractiveResult> {
		validateLaunchOptions(options);

		const { parts, needsShell } = this.findOpenCodeCommand();
		const { command, args, env, tempFile, shell } = buildSpawnParams(
			options,
			true,
			parts,
			needsShell,
			this.maxInlineConfigBytes
		);

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

				proc.on('close', code => {
					this.currentProcess = null;
					resolve({ response: '', exitCode: code });
				});
				proc.on('error', reject);
			});
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupTempFile(tempFile);
		}
	}

	public async launchBackground(options: LaunchOptions): Promise<ModelBackgroundResult> {
		validateLaunchOptions(options);

		const promptBytes = Buffer.byteLength(options.prompt, 'utf8');
		if (promptBytes > MAX_PROMPT_BYTES) {
			throw new PromptTooLargeError(promptBytes, MAX_PROMPT_BYTES);
		}

		const { parts, needsShell } = this.findOpenCodeCommand();
		const { command, args, env, tempFile, shell } = buildSpawnParams(
			options,
			false,
			parts,
			needsShell,
			this.maxInlineConfigBytes
		);

		try {
			return await new Promise<ModelBackgroundResult>((resolve, reject) => {
				const launchStartTime = Date.now();

				const proc = spawn(command, args, {
					cwd: options.workingDir,
					stdio: ['pipe', 'pipe', 'pipe'],
					shell,
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

					// Capture sessionID from any event, first one wins
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
								model: options.model ?? 'opencode',
							},
						};
						options.onStreamEvent?.(initEvent);
					} else if (eventType === 'text') {
						const part = parsed['part'] as Record<string, unknown> | undefined;
						const text = part?.['text'] as string | undefined;
						if (text) {
							responseText += text;
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

				proc.on('close', code => {
					this.currentProcess = null;
					// Flush any trailing line not terminated by newline
					flushLineBuffer();

					// Fire the result event only when at least one step_start was seen
					if (options.onStreamEvent && firstStepStartFired) {
						const resultEvent: StreamJsonEvent = {
							type: 'result',
							subtype: 'result',
							data: {
								result: responseText,
								cost_usd: costUsd,
								duration_ms: Date.now() - launchStartTime,
								modelUsage: {
									opencode: {
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
		}
	}

	public kill(): void {
		try {
			if (this.currentProcess) {
				this.currentProcess.kill();
			}
		} catch (err) {
			console.warn('[OpenCodeModelProvider] kill() failed:', err instanceof Error ? err.message : String(err));
		}
	}

	/**
	 * Resolve the opencode binary path.
	 * OPENCODE_MOCK_PATH env var overrides path resolution — used in tests.
	 */
	private findOpenCodeCommand(): { parts: string[]; needsShell: boolean } {
		const mockPath = process.env['OPENCODE_MOCK_PATH'];
		if (mockPath) {
			// .mjs/.js files are not directly executable -- run via node
			if (mockPath.endsWith('.mjs') || mockPath.endsWith('.js')) {
				return { parts: ['node', mockPath], needsShell: false };
			}
			return { parts: [mockPath], needsShell: false };
		}
		if (process.platform === 'win32') {
			// Prefer the .exe directly (T-05: no shell interpolation).
			// `where.exe opencode.exe` finds the Chocolatey/nvm .exe; falls back to shell:true only if absent.
			try {
				const exePath = execSync('where.exe opencode.exe', { encoding: 'utf8' }).trim().split('\n')[0]!.trim();
				if (exePath) return { parts: [exePath], needsShell: false };
			} catch {
				// .exe not found -- fall through to shell:true fallback
			}
			// Accepted risk: shell:true when only .cmd shim is available (documented in out-of-scope.md)
			return { parts: ['opencode'], needsShell: true };
		}
		try {
			return { parts: [execSync('which opencode', { encoding: 'utf8' }).trim()], needsShell: false };
		} catch {
			return { parts: ['opencode'], needsShell: false };
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
}
