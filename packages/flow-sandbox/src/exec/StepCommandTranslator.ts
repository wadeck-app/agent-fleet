import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import {
	type PathFlavor,
	UNC,
	WINDOWS_ABSOLUTE,
	basenameBySyntax,
	flavorOf,
	pathModuleOf,
	sameHostPath,
} from './HostPaths';
import { type VmEnvironmentFilter } from './VmEnvironmentFilter';
import type { VmFileStager } from './VmFileStager';

export interface StepCommandRequest {
	sandbox: string;
	command: string;
	args: readonly string[];
	/** The spawn option `shell`: with a command line (no args) it selects `sh -c`. */
	shell: boolean | string | undefined;
	cwd: string | undefined;
	env: Readonly<Record<string, string | undefined>> | undefined;
}

export interface TranslatedCommand {
	/** Program and arguments as the VM runs them (wrapped in the cleanup shell when files were copied in). */
	command: string[];
	/** The program the step runs, for the log (never the wrapper). */
	program: string;
	cwd: string | undefined;
	env: Record<string, string>;
	/** Host ports of MCP callback servers the process will connect to (one network rule each). */
	mcpCallbackPorts: number[];
}

// Positional arguments only: nothing of the step is spliced into this text.
const CLEANUP_SCRIPT = 'n=$1; shift; files=("${@:1:n}"); shift "$n"; "$@"; rc=$?; rm -f -- "${files[@]}"; exit $rc';
const PRE_TOOL_USE_HOOK_EXAMPLE =
	'hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node \\"<path>\\" pre", timeout = 30 }] }]';
/** Groups: the text before the script path, the path (no quote, no backslash: the engine writes forward slashes), the text after it. */
const PRE_TOOL_USE_HOOK =
	/^(hooks\.PreToolUse=\[\{ matcher = "\*", hooks = \[\{ type = "command", command = "node \\")([^"\\]+)(\\" pre", timeout = 30 \}\] \}\]$)/;

/** A codex setting under `hooks` (the engine's key is `hooks.<Event>`): the value of `-c`, `hooks` alone or `hooks.*`. */
function isHooksSetting(argument: string): boolean {
	const key = argument.slice(0, Math.max(argument.indexOf('='), 0));
	return key === 'hooks' || key.startsWith('hooks.');
}

/** Shells a `shell:` spawn option may name (resolved by the VM's own PATH). */
const SHELLS_IN_VM = new Set(['bash', 'sh']);
const REFUSED_PROGRAMS = new Map<string, string>([
	['cmd', 'cmd.exe does not exist in the VM'],
	['powershell', 'PowerShell does not exist in the VM'],
	['pwsh', 'PowerShell does not exist in the VM'],
]);

/**
 * Turns the spawn call the engine would make on the host into the command line, working directory and environment
 * the VM runs. Everything it cannot map faithfully is refused with the reason (no silent fallback):
 * - the program: the host `bash.exe` the script executor resolved becomes `bash`, the host node becomes `node`, a
 *   command line with `shell: true` becomes `/bin/sh -c`, `cmd`/`pwsh` are refused (route those steps to a worker
 *   without the `sandbox` label); a Windows path to any other program is refused;
 * - arguments that are host paths: a generated temp file is copied into the VM (VmFileStager), a path inside the run's two
 *   mounts is translated, anything else is refused (UNC paths, other drives, other host files). What counts as a host path
 *   depends on the host: on Windows any `C:\\x` path (a drive letter cannot be a VM path); on a POSIX host a path looks like a
 *   VM path, so only an absolute path under the mounts or under a known host directory (the temp directory, the home
 *   directory: `hostDirectories`) is a host path, and any other absolute path is assumed to be a VM path and passed through;
 * - the codex setting `-c hooks.PreToolUse=...` names the hook script INSIDE its value: the script is copied into the VM and only the
 *   path is replaced (any other shape, and any other `hooks.*` setting, is refused);
 * - `cwd` must be inside the two mounts (RunMounts, links rejected);
 * - the environment loses the host-only variables (VmEnvironmentFilter).
 */
export class StepCommandTranslator {
	private readonly flavor: PathFlavor;

	constructor(
		private readonly options: {
			/** Only translation and containment are used, so a stand-in works in tests. */
			mounts: Pick<RunMounts, 'toSandboxPath' | 'contains'>;
			/** The host's platform (default: this one). Decides what a host path looks like; tests pass `win32` and `linux` on any host. */
			platform?: NodeJS.Platform;
			/** POSIX hosts: directories whose absolute paths are host files (not VM paths): the temp directory, the home directory. */
			hostDirectories?: readonly string[];
			stager: VmFileStager;
			environment: VmEnvironmentFilter;
			hostNodePath: string;
			log: SandboxLog;
			/** Environment names the step declared (its env, its secrets, the wrapper's model env): never dropped as ambient. */
			declaredEnvironmentNames: ReadonlySet<string>;
		}
	) {
		this.flavor = flavorOf(options.platform ?? process.platform);
	}

	async translate(request: StepCommandRequest): Promise<TranslatedCommand> {
		const program = this.program(request);
		const mcpCallbackPorts: number[] = [];
		const staged: string[] = [];
		const args: string[] = [];
		for (const [index, argument] of program.args.entries()) {
			// The value of a codex `-c hooks.*=...` pair names a host script INSIDE the value: it is not a whole-argument path.
			if (program.args[index - 1] === '-c' && isHooksSetting(argument)) {
				args.push(await this.codexHookSetting(request.sandbox, argument, staged));
				continue;
			}
			args.push(await this.argument(request.sandbox, argument, mcpCallbackPorts, staged));
		}
		const filtered = this.options.environment.filter(request.env, this.options.declaredEnvironmentNames);
		this.options.environment.report(
			filtered,
			this.options.log,
			`process "${program.display}" in "${request.sandbox}"`
		);
		return {
			command: this.withCleanup([program.command, ...args], staged),
			program: program.display,
			cwd: request.cwd === undefined ? undefined : this.options.mounts.toSandboxPath(request.cwd, 'cwd'),
			env: filtered.env,
			mcpCallbackPorts,
		};
	}

	private program(request: StepCommandRequest): { command: string; args: readonly string[]; display: string } {
		const { command, args, shell } = request;
		if (args.length === 0 && shell !== undefined && shell !== false) {
			if (typeof shell === 'string' && !SHELLS_IN_VM.has(this.programName(shell))) {
				throw this.refused(
					command,
					`the shell ${JSON.stringify(shell)} is not available in the VM (only sh and bash are)`
				);
			}
			const shellName = typeof shell === 'string' ? this.programName(shell) : 'sh';
			return { command: shellName === 'bash' ? 'bash' : '/bin/sh', args: ['-c', command], display: shellName };
		}
		if (shell !== undefined && shell !== false) {
			throw this.refused(command, 'a spawn with both arguments and a shell is not supported');
		}
		const name = this.programName(command);
		const refusal = REFUSED_PROGRAMS.get(name);
		if (refusal !== undefined)
			throw this.refused(command, `${refusal}; run this step on a worker without the "sandbox" label`);
		// The host node is recognised first, wherever it lives (/usr/local/bin/node is no host directory, but it is not in the VM either).
		if (sameHostPath(command, this.options.hostNodePath, this.flavor)) {
			return { command: 'node', args, display: 'node' };
		}
		if (this.isHostPath(command)) {
			// A host path to bash used to be mapped to the VM's. Since core 1f4b567a the shell strategy asks the launcher (isolatesEnvironment), so a
			// host bash here means the engine resolved on the host: refused, no quiet mapping.
			if (SHELLS_IN_VM.has(name)) {
				throw this.refused(
					command,
					'it is a host path to a shell: the engine must resolve the shell through the sandbox launcher (update flow-cli to 2026.11.8-974 or later)'
				);
			}
			throw this.refused(
				command,
				"it is a host path and the VM has no such program. Call a program that exists in the sandbox image, by its name or its VM path (the host's files are not in the VM)"
			);
		}
		return { command, args, display: name };
	}

	private async argument(
		sandbox: string,
		argument: string,
		mcpCallbackPorts: number[],
		staged: string[]
	): Promise<string> {
		if (UNC.test(argument)) {
			throw new SandboxError(
				'path-outside-mounts',
				`The argument "${argument}" is a UNC path; the sandbox mounts only the run's workspace and .meta. If it is a file, copy it under the workspace and pass that path; a network path is never mounted.`
			);
		}
		if (!this.isHostPath(argument)) return argument;
		if (this.options.stager.isStageable(argument)) {
			const copy = await this.options.stager.stage(sandbox, argument);
			if (copy.mcpCallbackPort !== undefined) mcpCallbackPorts.push(copy.mcpCallbackPort);
			staged.push(copy.vmPath);
			return copy.vmPath;
		}
		// Inside the mounts: translated. Outside: refused by the mounts with the reason.
		try {
			return this.options.mounts.toSandboxPath(argument, 'argument');
		} catch (error) {
			// Under a mount the refusal is about a link or a `..` and already says so; elsewhere the value is a host path that is not mounted.
			if (
				!(error instanceof SandboxError) ||
				error.kind !== 'path-outside-mounts' ||
				this.options.mounts.contains(argument)
			) {
				throw error;
			}
			throw new SandboxError(
				'path-outside-mounts',
				`argument "${argument}" looks like a host path that is not mounted in the sandbox (the sandbox sees only the run's workspace and .meta). If it is a file, put it under the workspace and pass that path. If it is a literal value, not a file, do not pass it as a command-line argument: write it in the script text, which is never inspected. (${error.message})`
			);
		}
	}

	/**
	 * `hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node \"<host path>/hook.cjs\" pre", timeout = 30 }] }]`
	 * (CodexConfigBuilder.hookOverride; the engine writes the path with forward slashes): the script is copied into the VM and only the path is
	 * replaced, the rest of the value stays as is. Any other `hooks.*` setting (PostToolUse, SessionStart...) and any value that is not exactly
	 * this shape is refused: a host path is never passed through and never guessed.
	 */
	private async codexHookSetting(sandbox: string, setting: string, staged: string[]): Promise<string> {
		const key = setting.slice(0, setting.indexOf('='));
		if (key !== 'hooks.PreToolUse') {
			throw new SandboxError(
				'invalid-argument',
				`The codex setting "${key}" cannot be passed into the sandbox: only deny hooks that act before a tool call are supported on codex steps in a sandbox (hooks.PreToolUse). Remove the log/after hook or run the step on a worker without the "sandbox" label.`
			);
		}
		const match = PRE_TOOL_USE_HOOK.exec(setting);
		if (match === null) {
			throw new SandboxError(
				'invalid-argument',
				`The codex setting hooks.PreToolUse is not the shape the engine writes (\`${PRE_TOOL_USE_HOOK_EXAMPLE}\`), so the host path of the hook script in it cannot be replaced safely: ${JSON.stringify(setting)}. Run this step on a worker without the "sandbox" label, and report the engine change.`
			);
		}
		const [, before, hostPath, after] = match as unknown as [string, string, string, string];
		if (!this.options.stager.isStageable(hostPath)) {
			throw new SandboxError(
				'path-outside-mounts',
				`The codex setting hooks.PreToolUse names "${hostPath}", which is not a hook script the engine generates (<temp>/codex-run-<uuid>/hook.cjs), so it is not copied into the sandbox and the hook would not run. Run this step on a worker without the "sandbox" label.`
			);
		}
		const copy = await this.options.stager.stage(sandbox, hostPath);
		if (copy.kind !== 'codex-hook') {
			throw new SandboxError(
				'invalid-argument',
				`The codex setting hooks.PreToolUse names "${hostPath}", which is staged as a ${copy.kind}, not as a codex hook script.`
			);
		}
		staged.push(copy.vmPath);
		return `${before}${copy.vmPath}${after}`;
	}

	/**
	 * Files copied into the VM for this process are removed when it ends, by the same `exec` (no extra round trip):
	 * `bash -c 'n=$1; ...; "$@"; rc=$?; rm -f ...; exit $rc' flow-run <n> <files...> <program> <args...>`. The exit code is the
	 * program's. If the VM is stopped to end the process the files stay (a stop runs nothing).
	 */
	private withCleanup(command: string[], staged: readonly string[]): string[] {
		if (staged.length === 0) return command;
		return ['bash', '-c', CLEANUP_SCRIPT, 'flow-run', String(staged.length), ...staged, ...command];
	}

	/** See the class comment: certain on Windows, by location on a POSIX host. */
	private isHostPath(value: string): boolean {
		if (this.flavor === 'win32') return WINDOWS_ABSOLUTE.test(value) || UNC.test(value);
		if (!pathModuleOf('posix').isAbsolute(value)) return false;
		return (
			this.options.mounts.contains(value) ||
			(this.options.hostDirectories ?? []).some(directory => this.isUnderPosix(directory, value))
		);
	}

	private isUnderPosix(directory: string, value: string): boolean {
		const relative = pathModuleOf('posix').relative(directory, value);
		return relative === '' || (!relative.startsWith('..') && !pathModuleOf('posix').isAbsolute(relative));
	}

	private programName(command: string): string {
		const base = basenameBySyntax(command).toLowerCase();
		return base.replace(/\.(exe|cmd|bat)$/, '');
	}

	private refused(command: string, reason: string): SandboxError {
		return new SandboxError('invalid-argument', `The sandbox cannot run "${command}": ${reason}.`);
	}
}
