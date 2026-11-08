import path from 'node:path';

import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { UNC, WINDOWS_ABSOLUTE, sameHostPath } from './HostPaths';
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
 * - arguments that are Windows absolute paths: a generated temp file is copied into the VM (VmFileStager), a path inside
 *   the run's two mounts is translated, anything else is refused (UNC paths, other drives, other host files);
 * - `cwd` must be inside the two mounts (RunMounts, links rejected);
 * - the environment loses the host-only variables (VmEnvironmentFilter).
 */
export class StepCommandTranslator {
	constructor(
		private readonly options: {
			mounts: RunMounts;
			stager: VmFileStager;
			environment: VmEnvironmentFilter;
			hostNodePath: string;
			log: SandboxLog;
			/** Environment names the step declared (its env, its secrets, the wrapper's model env): never dropped as ambient. */
			declaredEnvironmentNames: ReadonlySet<string>;
		}
	) {}

	async translate(request: StepCommandRequest): Promise<TranslatedCommand> {
		const program = this.program(request);
		const mcpCallbackPorts: number[] = [];
		const staged: string[] = [];
		const args: string[] = [];
		for (const argument of program.args) {
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
		if (this.isHostPath(command)) {
			if (sameHostPath(command, this.options.hostNodePath)) {
				return { command: 'node', args, display: 'node' };
			}
			// A host path to bash used to be mapped to the VM's. Since core 1f4b567a the shell strategy asks the launcher (isolatesEnvironment), so a
			// host bash here means the engine resolved on the host: refused, no quiet mapping.
			if (SHELLS_IN_VM.has(name)) {
				throw this.refused(
					command,
					'it is a host path to a shell: the engine must resolve the shell through the sandbox launcher (update flow-cli to 2026.11.8-974 or later)'
				);
			}
			throw this.refused(command, 'it is a host path and the VM has no such program');
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
				`The argument "${argument}" is a UNC path; the sandbox mounts only the run's workspace and .meta.`
			);
		}
		if (!WINDOWS_ABSOLUTE.test(argument)) return argument;
		if (this.options.stager.isStageable(argument)) {
			const copy = await this.options.stager.stage(sandbox, argument);
			if (copy.mcpCallbackPort !== undefined) mcpCallbackPorts.push(copy.mcpCallbackPort);
			staged.push(copy.vmPath);
			return copy.vmPath;
		}
		// Inside the mounts: translated. Outside: refused by the mounts with the reason.
		return this.options.mounts.toSandboxPath(argument, 'argument');
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

	private isHostPath(command: string): boolean {
		return WINDOWS_ABSOLUTE.test(command) || UNC.test(command);
	}

	private programName(command: string): string {
		const base = path.win32.basename(command).toLowerCase();
		return base.replace(/\.(exe|cmd|bat)$/, '');
	}

	private refused(command: string, reason: string): SandboxError {
		return new SandboxError('invalid-argument', `The sandbox cannot run "${command}": ${reason}.`);
	}
}
