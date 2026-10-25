/**
 * OpenCodeWindowsShell -- decides which shell opencode's `bash` tool must use on Windows.
 *
 * Why: with no `SHELL`, opencode (verified on the installed 1.19.4 binary) picks the first of
 * pwsh, powershell, Git Bash, COMSPEC. A model step therefore ran its bash tool under Windows
 * PowerShell 5.1 (`curl` is Invoke-WebRequest, `A=1 cmd &` is rejected, files get a UTF-8 BOM),
 * while the claude provider has real bash. opencode honours `SHELL` first when it is an absolute
 * Windows path to an existing file, and treats a shell named `bash` as a login bash.
 *
 * Only an explicit, discovered Git Bash path is ever offered. The daemon's own SHELL (possibly an
 * MSYS style `/bin/bash.exe`) is never forwarded, and nothing is guessed when Git Bash is absent.
 */
import * as path from 'node:path';

import { resolveBashOnWindows } from '../executor/shell/WindowsBashEnvironment';

export type OpenCodeShellDecision =
	/** Set `SHELL` to this Git Bash executable. */
	| { kind: 'set'; shell: string }
	/** The step/flow env already sets SHELL: respect it. */
	| { kind: 'step-provided' }
	/** Not Windows: opencode's default is already a POSIX shell. */
	| { kind: 'not-applicable' }
	/** Windows, no SHELL, Git Bash not discoverable: leave opencode on its PowerShell default. */
	| { kind: 'not-found' };

export interface OpenCodeShellProbe {
	platform: NodeJS.Platform;
	/** Returns an absolute Git Bash path, or null. */
	findGitBash: (env: Record<string, string>) => string | null;
}

/** Message shared by the runtime warning and `flow validate`. */
export const OPENCODE_SHELL_NOT_FOUND_ADVICE =
	'Git Bash was not found, so the opencode bash tool will run under PowerShell on Windows (curl is Invoke-WebRequest, "VAR=1 cmd" is rejected, files are written with a UTF-8 BOM). ' +
	'Install Git for Windows, or set FLOW_BASH_PATH (or SHELL in the step/flow env) to a bash.exe path.';

export const defaultOpenCodeShellProbe: OpenCodeShellProbe = {
	platform: process.platform,
	findGitBash: findGitBashForOpenCode,
};

/** Windows paths that carry the WSL bash stub, which cannot see Windows paths. */
function isWslBashStub(candidate: string): boolean {
	const lower = candidate.toLowerCase().replace(/\//g, '\\');
	return lower.includes('\\windows\\system32\\') || lower.includes('\\windowsapps\\');
}

/**
 * Finds Git Bash through flow's script-step resolver, and refuses what that resolver returns as a
 * last resort: the bare name `bash` (not a path opencode can use) or the WSL stub.
 */
export function findGitBashForOpenCode(env: Record<string, string>): string | null {
	const resolved = resolveBashOnWindows(env);
	if (!path.win32.isAbsolute(resolved) || isWslBashStub(resolved)) {
		return null;
	}
	return resolved;
}

/**
 * @param stepEnv - the env the step/flow declares (what the provider receives as `options.env`)
 */
export function resolveOpenCodeShell(
	stepEnv: Record<string, string>,
	probe: OpenCodeShellProbe = defaultOpenCodeShellProbe
): OpenCodeShellDecision {
	if (probe.platform !== 'win32') {
		return { kind: 'not-applicable' };
	}
	const declared = stepEnv['SHELL'];
	if (declared !== undefined && declared !== '') {
		return { kind: 'step-provided' };
	}
	const lookupEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			lookupEnv[key] = value;
		}
	}
	const shell = probe.findGitBash({ ...lookupEnv, ...stepEnv });
	return shell === null ? { kind: 'not-found' } : { kind: 'set', shell };
}
