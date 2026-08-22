/**
 * ClaudeModelProvider — implements ModelProvider by wrapping ClaudeLauncher.
 *
 * Responsibilities:
 *  - Serializes McpServer[] to a temp JSON file (Claude format), passes --mcp-config <path>
 *  - Serializes ClaudeHooks to a temp settings JSON file, passes --settings <path> --include-hook-events
 *  - Sets file permissions 0o600 on temp files (best-effort; non-fatal on Windows)
 *  - Deletes temp files in finally (even on error)
 *  - Tracks current ChildProcess for kill()
 *  - Validates all inputs before spawning
 */
import type { ChildProcess } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ClaudeHookTranslator } from './ClaudeHookTranslator';
import { ClaudeLauncher } from './ClaudeLauncher';
import type {
	LaunchOptions,
	McpServer,
	ModelBackgroundResult,
	ModelInteractiveResult,
	ModelProvider,
} from './ModelProvider';
import { validateLaunchOptions } from './ModelProvider';

/**
 * Build Claude MCP config JSON from McpServer[].
 * Claude CLI expects: { mcpServers: { name: { command, args, env?, cwd? } } }
 */
function buildClaudeMcpConfig(servers: McpServer[]): Record<string, unknown> {
	const mcpServers: Record<string, unknown> = {};
	for (const s of servers) {
		const [command, ...args] = s.command;
		const entry: Record<string, unknown> = { command, args };
		if (s.env && Object.keys(s.env).length > 0) {
			entry['env'] = s.env;
		}
		if (s.cwd) {
			entry['cwd'] = s.cwd;
		}
		mcpServers[s.name] = entry;
	}
	return { mcpServers };
}

export class ClaudeModelProvider implements ModelProvider {
	private readonly launcher = new ClaudeLauncher();
	private currentProcess: ChildProcess | null = null;

	public async launchInteractive(options: LaunchOptions): Promise<ModelInteractiveResult> {
		validateLaunchOptions(options);

		const mcpConfigPath = await this.writeMcpConfig(options.mcpServers);
		const settingsPath = await this.writeClaudeSettings(options);
		try {
			return await this.launcher.launchInteractive(this.toClaudeOptions(options, mcpConfigPath, settingsPath));
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupMcpConfig(mcpConfigPath);
			this.cleanupClaudeSettings(settingsPath);
		}
	}

	public async launchBackground(options: LaunchOptions): Promise<ModelBackgroundResult> {
		validateLaunchOptions(options);

		const mcpConfigPath = await this.writeMcpConfig(options.mcpServers);
		const settingsPath = await this.writeClaudeSettings(options);
		try {
			return await this.launcher.launchBackground(this.toClaudeOptions(options, mcpConfigPath, settingsPath));
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupMcpConfig(mcpConfigPath);
			this.cleanupClaudeSettings(settingsPath);
		}
	}

	public kill(): void {
		try {
			if (this.currentProcess) {
				this.currentProcess.kill();
			}
		} catch (err) {
			console.warn('[ClaudeModelProvider] kill() failed:', err instanceof Error ? err.message : String(err));
		}
	}

	private toClaudeOptions(
		options: LaunchOptions,
		mcpConfigPath: string | undefined,
		settingsPath: string | undefined
	) {
		return {
			workingDir: options.workingDir,
			prompt: options.prompt,
			stepId: options.stepId,
			model: options.model,
			env: options.env,
			mcpConfigPath,
			settingsPath,
			skipPermissions: options.skipPermissions,
			streamJson: options.streamJson,
			verbose: options.verbose,
			resumeSessionId: options.resumeSessionId,
			autoCompact: options.autoCompact,
			onProcessStarted: (proc: ChildProcess) => {
				this.currentProcess = proc;
				options.onProcessStarted?.(proc);
			},
			onStreamEvent: options.onStreamEvent,
			isolateEnv: true,
		};
	}

	private async writeMcpConfig(servers: McpServer[] | undefined): Promise<string | undefined> {
		if (!servers || servers.length === 0) return undefined;

		const config = buildClaudeMcpConfig(servers);
		const json = JSON.stringify(config, null, 2);
		const filePath = path.join(os.tmpdir(), `mcp-config-${crypto.randomUUID()}.json`);

		await fs.promises.writeFile(filePath, json, { encoding: 'utf8' });

		// Best-effort: set permissions 0o600 (non-fatal on Windows)
		try {
			await fs.promises.chmod(filePath, 0o600);
		} catch {
			// non-fatal
		}

		return filePath;
	}

	private cleanupMcpConfig(filePath: string | undefined): void {
		if (!filePath) return;
		try {
			fs.unlinkSync(filePath);
		} catch {
			// non-fatal
		}
	}

	private async writeClaudeSettings(options: LaunchOptions): Promise<string | undefined> {
		const settings = ClaudeHookTranslator.toSettingsJson(options.toolHooks ?? []);
		if (!settings) return undefined;

		const json = JSON.stringify(settings, null, 2);
		const filePath = path.join(os.tmpdir(), `claude-settings-${crypto.randomUUID()}.json`);

		await fs.promises.writeFile(filePath, json, { encoding: 'utf8' });

		// Best-effort: set permissions 0o600 (non-fatal on Windows)
		try {
			await fs.promises.chmod(filePath, 0o600);
		} catch {
			// non-fatal
		}

		return filePath;
	}

	private cleanupClaudeSettings(filePath: string | undefined): void {
		if (!filePath) return;
		try {
			fs.unlinkSync(filePath);
		} catch {
			// non-fatal
		}
	}
}
