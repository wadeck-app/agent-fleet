import { SandboxError } from '../SandboxError';
import type { SandboxRuntime } from '../SandboxRuntime';

/** Programs the engine looks up before it launches a step (claude, codex, opencode) plus the ones the translator maps. */
export const DEFAULT_LOOKED_UP_PROGRAMS = ['claude', 'codex', 'opencode', 'node', 'bash', 'pwsh'] as const;

const LOOKUP_COMMAND = /^(?:where|where\.exe|which)\s+([A-Za-z0-9._-]+)$/;

/**
 * `ProcessLauncher.lookupExecutable` is synchronous (the engine calls `execSync` today) while reaching the VM is
 * not, so the lookup is answered from a table that `prime` fills with ONE `exec` in the sandbox (`command -v` for each
 * program, run by the VM's own bash with the VM's own PATH). The table is per sandbox name and kept for the life of
 * the worker: the image does not change under a running worker.
 *
 * A name that was not primed, or that the VM does not have, throws: the callers read a throw as "not found".
 * `where.exe codex.cmd` style names are looked up as `codex` (the extension is a Windows convention).
 */
export class VmExecutableLookup {
	private readonly tables = new Map<string, Map<string, string>>();

	constructor(private readonly runtime: SandboxRuntime) {}

	async prime(sandbox: string, programs: readonly string[] = DEFAULT_LOOKED_UP_PROGRAMS): Promise<void> {
		if (this.tables.has(sandbox)) return;
		for (const program of programs) {
			if (!/^[A-Za-z0-9._-]+$/.test(program)) {
				throw new SandboxError(
					'invalid-argument',
					`Cannot look up "${program}" in the sandbox: not a plain program name.`
				);
			}
		}
		const result = await this.runtime.exec({
			sandbox,
			// Names are positional arguments, never spliced into the script text.
			command: [
				'bash',
				'-c',
				'for name in "$@"; do path=$(command -v "$name" 2>/dev/null) && printf "%s=%s\\n" "$name" "$path"; done; true',
				'flow-lookup',
				...programs,
			],
		});
		if (result.exitCode !== 0) {
			throw new SandboxError(
				'command-failed',
				`Looking up ${programs.join(', ')} in sandbox "${sandbox}" failed with exit code ${result.exitCode}: ${result.stderr.trim() || '(no error output)'}. Check that the image has bash.`,
				{ sandbox, exitCode: result.exitCode, stderr: result.stderr }
			);
		}
		const table = new Map<string, string>();
		for (const line of result.stdout.split(/\r?\n/)) {
			const separator = line.indexOf('=');
			if (separator > 0) table.set(line.slice(0, separator), line.slice(separator + 1));
		}
		this.tables.set(sandbox, table);
	}

	/** Synchronous answer for `ProcessLauncher.lookupExecutable`. */
	answer(sandbox: string, commandLine: string): string {
		const match = LOOKUP_COMMAND.exec(commandLine.trim());
		if (match === null) {
			throw new SandboxError(
				'invalid-argument',
				`The sandbox launcher only answers "which <name>" / "where <name>" lookups, got ${JSON.stringify(commandLine)}.`
			);
		}
		const table = this.tables.get(sandbox);
		if (table === undefined) {
			throw new SandboxError(
				'invalid-argument',
				`No executable lookup was primed for sandbox "${sandbox}": call prime() before the first step (the lookup is synchronous, reaching the VM is not).`,
				{ sandbox }
			);
		}
		const name = (match[1] as string).replace(/\.(exe|cmd|bat)$/i, '');
		const found = table.get(name);
		if (found === undefined) {
			const shellHint =
				name === 'pwsh' || name === 'powershell'
					? ` A step with shell: ${name} cannot run in the sandbox (PowerShell is not in the image); use shell: bash.`
					: '';
			throw new SandboxError(
				'not-found',
				`"${name}" is not installed in sandbox "${sandbox}" (primed: ${[...table.keys()].join(', ') || 'nothing'}). Use an image that has it (image/Dockerfile).${shellHint}`,
				{ sandbox }
			);
		}
		return found;
	}
}
