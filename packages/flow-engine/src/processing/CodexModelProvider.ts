/**
 * CodexModelProvider -- implements ModelProvider for the Codex CLI.
 *
 * Background (`launchBackground`): `codex exec [resume <threadId>] [flags] -- <prompt>`, JSONL on
 * stdout (parsed by CodexEventParser). Interactive: the TUI, `codex [resume <threadId>] [flags] -- <prompt>`.
 *
 * How each LaunchOptions field reaches codex (all verified against codex-cli 0.163.0, see the
 * integration test; "unverified" is called out where it applies):
 *  - model            -m
 *  - resumeSessionId  `exec resume <id>` subcommand. That subcommand rejects --sandbox and
 *                     --approve-for-me ("unexpected argument", exit 2), so on resume the same
 *                     settings are sent as `-c sandbox_mode=... / approval_policy / approvals_reviewer`.
 *  - skipPermissions  --approve-for-me (workspace-write sandbox + automatic approval review)
 *  - tools            CodexToolPolicy: read-only sandbox / --disable shell_tool / web_search off;
 *                     exclusions codex cannot enforce throw
 *  - mcpServers       `-c mcp_servers.<name>.*` overrides (CodexConfigBuilder). There is no
 *                     environment-variable config in codex, and CODEX_HOME is deliberately NOT
 *                     redirected: it holds the auth, model provider settings and saved sessions.
 *  - toolHooks        `-c hooks.PreToolUse/PostToolUse` + --dangerously-bypass-hook-trust, running a
 *                     generated script (CodexHookTranslator). Without the flag codex silently skips hooks.
 *  - env              forwarded to the codex process. Verified: ordinary variables (checked with
 *                     MY_STEP_VAR and MY_STEP_TOKEN in the codex process env, by a one-off probe,
 *                     not by the integration suite) reach the shell commands the model runs.
 *  - workingDir       spawn cwd
 *  - permission       not supported -> throws (opencode-only concept)
 *  - autoCompact      not supported -> throws (session.mode 'compact')
 *  - streamJson/verbose  codex always streams JSONL; nothing to toggle
 *
 * Env isolation: only PATH/HOME/USERPROFILE/SystemRoot/PATHEXT and options.env are forwarded;
 * process.env is never inherited wholesale.
 * Prompt limit: 32KB -- throws PromptTooLargeError if exceeded.
 */
import { type ChildProcess, execSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { CodexConfigBuilder } from './CodexConfigBuilder';
import { CodexEventParser } from './CodexEventParser';
import { CodexHookTranslator } from './CodexHookTranslator';
import { CodexToolPolicy } from './CodexToolPolicy';
import type { LaunchOptions, ModelBackgroundResult, ModelInteractiveResult, ModelProvider } from './ModelProvider';
import { PromptTooLargeError, validateLaunchOptions } from './ModelProvider';

const MAX_PROMPT_BYTES = 32 * 1024; // 32KB

type LaunchMode = 'exec' | 'tui';

interface PreparedLaunch {
	command: string;
	args: string[];
	env: Record<string, string>;
	shell: boolean;
	/** Temp dir holding the hook script and log; absent when the step has no hooks. */
	hookDir?: string;
	hookLogFile?: string;
}

export class CodexModelProvider implements ModelProvider {
	private currentProcess: ChildProcess | null = null;

	public async launchInteractive(options: LaunchOptions): Promise<ModelInteractiveResult> {
		const prepared = this.prepare(options, 'tui');
		try {
			return await new Promise<ModelInteractiveResult>((resolve, reject) => {
				// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so grandchildren (the codex CLI's own child processes) allocate a visible console; this stdio:'inherit' spawn must inherit the daemon's hidden console (d032e7e)
				const proc = spawn(prepared.command, prepared.args, {
					cwd: options.workingDir,
					stdio: 'inherit',
					shell: prepared.shell,
					env: prepared.env,
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
			this.cleanupHookDir(prepared.hookDir);
		}
	}

	public async launchBackground(options: LaunchOptions): Promise<ModelBackgroundResult> {
		validateLaunchOptions(options);
		const promptBytes = Buffer.byteLength(options.prompt, 'utf8');
		if (promptBytes > MAX_PROMPT_BYTES) {
			throw new PromptTooLargeError(promptBytes, MAX_PROMPT_BYTES);
		}
		const prepared = this.prepare(options, 'exec');
		try {
			return await new Promise<ModelBackgroundResult>((resolve, reject) => {
				const launchStartTime = Date.now();

				const proc = spawn(prepared.command, prepared.args, {
					cwd: options.workingDir,
					stdio: ['ignore', 'pipe', 'pipe'],
					shell: prepared.shell,
					windowsHide: true,
					env: prepared.env,
				});
				this.currentProcess = proc;
				options.onProcessStarted?.(proc);

				const parser = new CodexEventParser(options.model, options.onStreamEvent);
				let stdout = '';
				let stderr = '';

				proc.stdout?.on('data', (data: Buffer) => {
					const chunk = data.toString();
					stdout += chunk;
					parser.feed(chunk);
				});

				proc.stderr?.on('data', (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on('exit', code => {
					this.currentProcess = null;
					parser.flush();
					parser.emitResult(Date.now() - launchStartTime);

					const extra = [parser.failureSummary(), this.readHookLog(prepared.hookLogFile)]
						.filter(Boolean)
						.join('\n');
					const separator = extra && stderr && !stderr.endsWith('\n') ? '\n' : '';
					resolve({ stdout, stderr: extra ? `${stderr}${separator}${extra}` : stderr, exitCode: code ?? -1 });
				});
				proc.on('error', reject);
			});
		} finally {
			this.kill();
			this.currentProcess = null;
			this.cleanupHookDir(prepared.hookDir);
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
	 * Validate the options, refuse what codex cannot honour, and build the command line.
	 * Everything that can throw does so here, before anything is spawned or written.
	 */
	private prepare(options: LaunchOptions, mode: LaunchMode): PreparedLaunch {
		validateLaunchOptions(options);
		this.rejectUnsupported(options);

		const policy = CodexToolPolicy.resolve(options.tools);
		for (const warning of policy.warnings) {
			console.warn(`[CodexModelProvider] step '${options.stepId}': ${warning}`);
		}

		const { parts, needsShell } = this.findCodexCommand({ ...process.env, ...(options.env ?? {}) });
		const resuming = options.resumeSessionId !== undefined && options.resumeSessionId !== '';
		const flags: string[] = [];

		if (mode === 'exec') {
			flags.push('--json');
			// Always skip git repo check -- flow can be run from any directory. The TUI has no such
			// flag (it is not in `codex --help`).
			flags.push('--skip-git-repo-check');
		}

		// Codex exec runs read-only by default (verified: a plain `codex exec` could not write a file
		// here), so a step that writes needs --approve-for-me. `--auto` does not exist in codex.
		// The full escape hatch --dangerously-bypass-approvals-and-sandbox is deliberately not used:
		// it drops the sandbox too, which is more than "do not prompt me" asks for.
		// `--approve-for-me` conflicts with `--sandbox` (exit 2, "cannot be used with"); read-only is the
		// stricter request, so it wins.
		const nativePermissionFlags = !(mode === 'exec' && resuming);
		if (policy.readOnlySandbox) {
			flags.push(...(nativePermissionFlags ? ['--sandbox', 'read-only'] : this.overrideSandbox('read-only')));
		} else if (options.skipPermissions === true) {
			flags.push(
				...(nativePermissionFlags
					? ['--approve-for-me']
					: [
							...this.overrideSandbox('workspace-write'),
							...CodexConfigBuilder.override('approval_policy', '"on-request"'),
							...CodexConfigBuilder.override('approvals_reviewer', '"auto_review"'),
						])
			);
		}

		if (policy.disableShell) {
			flags.push('--disable', 'shell_tool');
		}
		if (policy.disableWebSearch) {
			flags.push(...CodexConfigBuilder.override('web_search', '"disabled"'));
		}

		if (options.model) {
			flags.push('-m', options.model);
		}

		if (options.mcpServers && options.mcpServers.length > 0) {
			flags.push(...CodexConfigBuilder.mcpServerOverrides(options.mcpServers));
		}

		let hookDir: string | undefined;
		let hookLogFile: string | undefined;
		const hooks = options.toolHooks ?? [];
		if (hooks.length > 0) {
			hookDir = path.join(os.tmpdir(), `codex-run-${crypto.randomUUID()}`);
			hookLogFile = path.join(hookDir, 'hook.log');
			const script = CodexHookTranslator.toScript(hooks, hookLogFile);
			for (const warning of script.warnings) {
				console.warn(`[CodexModelProvider] step '${options.stepId}': ${warning}`);
			}
			if (script.source === undefined) {
				hookDir = undefined;
				hookLogFile = undefined;
			} else {
				const scriptPath = path.join(hookDir, 'hook.cjs');
				fs.mkdirSync(hookDir, { recursive: true });
				fs.writeFileSync(scriptPath, script.source, { encoding: 'utf8' });
				// Forward slashes: valid in cmd, PowerShell and node alike, and no escaping to get wrong.
				const quoted = `"${scriptPath.replace(/\\/g, '/')}"`;
				if (script.hasBefore) {
					flags.push(...CodexConfigBuilder.hookOverride('PreToolUse', `node ${quoted} pre`));
				}
				if (script.hasAfter) {
					flags.push(...CodexConfigBuilder.hookOverride('PostToolUse', `node ${quoted} post`));
				}
				// Codex does NOT run hooks it has not been told to trust, and says nothing when it skips
				// them (verified: a deny hook was ignored and the command ran). The script is generated
				// here from the step's own toolHooks, so it is trusted by construction. Side effect: this
				// run also stops requiring trust for hooks in the user's own config.toml.
				flags.push('--dangerously-bypass-hook-trust');
			}
		}

		// A prompt that starts with "-" (a markdown bullet, say) is read as a flag unless it follows
		// `--` (verified: `codex exec "- hi"` exits 2 "unexpected argument").
		const positionals = options.prompt ? ['--', options.prompt] : [];
		const subcommand = mode === 'exec' ? ['exec'] : [];
		const resume = resuming ? ['resume', options.resumeSessionId!] : [];
		const args = [...parts.slice(1), ...subcommand, ...resume, ...flags, ...positionals];

		if (needsShell && flags.some(arg => arg.includes('"'))) {
			this.cleanupHookDir(hookDir);
			throw new Error(
				'codex was found only as a shell command (the npm wrapper codex.js was not located next to codex.cmd), and the MCP/hook settings this step needs cannot be passed through a shell without being mangled. Install codex globally with npm (npm i -g @openai/codex) so codex.cmd resolves, or set CODEX_MOCK_PATH.'
			);
		}

		const infraEnv: Record<string, string> = {};
		for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'PATHEXT']) {
			const value = process.env[key];
			if (value) infraEnv[key] = value;
		}

		return {
			command: parts[0]!,
			args,
			env: { ...infraEnv, ...(options.env ?? {}) },
			shell: needsShell,
			hookDir,
			hookLogFile,
		};
	}

	/**
	 * Options codex has no way to honour. Throwing beats ignoring them: the step would otherwise
	 * run with weaker settings than its author asked for, with nothing saying so.
	 */
	private rejectUnsupported(options: LaunchOptions): void {
		if (options.permission !== undefined && Object.keys(options.permission).length > 0) {
			throw new Error(
				`Step '${options.stepId}': 'permission' (${Object.keys(options.permission).join(', ')}) is an opencode feature and codex has no equivalent per-action overrides. For codex use skipPermissions (workspace-write sandbox with automatic approval review) or a 'tools' restriction (read-only sandbox), or run this step with provider: opencode.`
			);
		}
		if (options.autoCompact === true) {
			throw new Error(
				`Step '${options.stepId}': session.mode 'compact' is not supported by codex (no explicit compaction request; codex compacts on its own near the context limit). Use session.mode 'append' to continue the thread.`
			);
		}
	}

	private overrideSandbox(mode: 'read-only' | 'workspace-write'): string[] {
		return CodexConfigBuilder.override('sandbox_mode', `"${mode}"`);
	}

	private readHookLog(logFile: string | undefined): string {
		if (!logFile) return '';
		try {
			return fs.readFileSync(logFile, 'utf8').trimEnd();
		} catch {
			// No hook ever logged (the file is created on first write), which is a normal outcome
			return '';
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

	private cleanupHookDir(dirPath: string | undefined): void {
		if (!dirPath) return;
		try {
			fs.rmSync(dirPath, { recursive: true, force: true });
		} catch {
			// non-fatal
		}
	}
}
