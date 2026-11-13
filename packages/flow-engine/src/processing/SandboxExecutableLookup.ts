import type { ProcessLauncher } from './ProcessLauncher';

export type ModelCliName = 'claude' | 'codex' | 'opencode';

/** True when the launcher runs processes somewhere else than the host (a sandbox): host paths and host probing are meaningless. */
export function runsElsewhere(launcher: ProcessLauncher): boolean {
	return launcher.isolatesEnvironment === true;
}

/**
 * The model CLIs live in the sandbox image, so their path comes from the launcher alone (`which <tool>`, the sandbox is
 * POSIX), never from a host probe. A failed or empty answer throws: no bare-name fallback hides a missing install.
 */
export function whichInSandboxOrThrow(launcher: ProcessLauncher, tool: ModelCliName): string {
	const command = `which ${tool}`;
	let reason: string;
	try {
		const answer = launcher.lookupExecutable(command).trim();
		if (answer) return answer;
		reason = 'empty answer';
	} catch (error) {
		reason = error instanceof Error ? error.message : String(error);
	}
	throw new Error(
		`${tool} not found in the sandbox launcher (lookup '${command}' failed: ${reason}). ` +
			`Install ${tool} in the sandbox image.`
	);
}
