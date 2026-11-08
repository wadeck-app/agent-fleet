import type { ProcessLauncher } from '../../processing/ProcessLauncher';

export type ShellLookupResult = { found: string } | { reason: string };

/**
 * Looks a shell binary up through a {@link ProcessLauncher}, so a launcher that runs the script elsewhere (a sandbox)
 * answers from where the script runs instead of from the host.
 */
export class LauncherShellLookup {
	constructor(private readonly launcher: ProcessLauncher) {}

	/** True when the launcher runs processes somewhere else than the host: host paths and host probing are meaningless. */
	public get runsElsewhere(): boolean {
		return this.launcher.isolatesEnvironment === true;
	}

	/** Names the launcher in error messages. */
	public get kind(): string {
		return this.runsElsewhere ? 'sandbox launcher' : 'host launcher';
	}

	/** Runs the lookup command line; a failure or an empty answer is "not found" with the reason, never a throw. */
	public lookup(command: string): ShellLookupResult {
		try {
			const answer = this.launcher.lookupExecutable(command).trim();
			return answer ? { found: answer } : { reason: 'empty answer' };
		} catch (error) {
			return { reason: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Resolution inside the place the launcher runs scripts (assumed POSIX: `which`). Throws an actionable error naming
	 * the launcher kind, the shell, the command and the reason.
	 */
	public whichOrThrow(shell: 'bash' | 'pwsh'): string {
		const command = `which ${shell}`;
		const result = this.lookup(command);
		if ('found' in result) return result.found;
		throw new Error(
			`${shell} not found in the ${this.kind} (lookup '${command}' failed: ${result.reason}). ` +
				`Install ${shell} in the sandbox image or pick a shell that exists there.`
		);
	}
}
