import * as fs from 'node:fs';
import * as path from 'node:path';

import { DefaultProcessLauncher } from '../../processing/DefaultProcessLauncher';
import type { ProcessLauncher } from '../../processing/ProcessLauncher';
import { LauncherShellLookup } from './LauncherShellLookup';
import type { ShellStrategy } from './ShellStrategy';

/**
 * Resolves the bash binary for `shell: bash` steps.
 *
 * The lookup goes through the injected {@link ProcessLauncher}. A launcher that runs scripts elsewhere
 * (`isolatesEnvironment`, a sandbox) answers `which bash` from where the script runs, whatever the host platform:
 * FLOW_BASH_PATH, Git Bash locations and the PATH scan are host facts and are not consulted then.
 *
 * Host Windows resolution mirrors ScriptExecutor's resolveBashOnWindows(): WScript.Shell.Run (the
 * daemon launcher) spawns with the system PATH, which carries System32's WSL bash.exe stub
 * ahead of Git Bash's MSYS2 directories -- known Git for Windows locations are checked before
 * the PATH scan for that reason. Unlike that function, this strategy fails fast instead of
 * falling back to a bare 'bash' lookup that could silently resolve to WSL.
 */
export class BashShellStrategy implements ShellStrategy {
	private static readonly KNOWN_WINDOWS_LOCATIONS = [
		'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
		'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
		'C:\\Program Files\\Git\\bin\\bash.exe',
	];

	private readonly lookup: LauncherShellLookup;

	constructor(launcher: ProcessLauncher = new DefaultProcessLauncher()) {
		this.lookup = new LauncherShellLookup(launcher);
	}

	public resolve(env: NodeJS.ProcessEnv): string {
		if (this.lookup.runsElsewhere) return this.lookup.whichOrThrow('bash');
		return process.platform === 'win32' ? this.resolveWindows(env) : this.resolveUnix();
	}

	private resolveWindows(env: NodeJS.ProcessEnv): string {
		const pinned = env['FLOW_BASH_PATH'];
		if (pinned && fs.existsSync(pinned)) return pinned;

		for (const loc of BashShellStrategy.KNOWN_WINDOWS_LOCATIONS) {
			if (fs.existsSync(loc)) return loc;
		}

		// Windows path semantics (';' delimiter, backslash join) whatever the host node:path flavour is
		// (see WindowsShellStrategies.posixHost.test.ts)
		const pathEnv = env['PATH'] ?? '';
		for (const dir of pathEnv.split(path.win32.delimiter)) {
			const candidate = path.win32.join(dir, 'bash.exe');
			if (fs.existsSync(candidate)) return candidate;
		}

		throw new Error(
			'bash not found: checked FLOW_BASH_PATH, known Git for Windows install paths ' +
				'(C:\\Program Files\\Git\\usr\\bin\\bash.exe and similar), and PATH for bash.exe. ' +
				'Install Git Bash or add it to PATH.'
		);
	}

	private resolveUnix(): string {
		const result = this.lookup.lookup('which bash');
		if ('found' in result) return result.found;
		throw new Error("bash not found: checked PATH via 'which bash'. Install bash or add it to PATH.");
	}
}
