import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ShellStrategy } from './ShellStrategy';

/**
 * Resolves the bash binary for `shell: bash` steps.
 *
 * Windows resolution mirrors ScriptExecutor's resolveBashOnWindows(): WScript.Shell.Run (the
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

	public resolve(env: NodeJS.ProcessEnv): string {
		return process.platform === 'win32' ? this.resolveWindows(env) : this.resolveUnix();
	}

	private resolveWindows(env: NodeJS.ProcessEnv): string {
		const pinned = env['FLOW_BASH_PATH'];
		if (pinned && fs.existsSync(pinned)) return pinned;

		for (const loc of BashShellStrategy.KNOWN_WINDOWS_LOCATIONS) {
			if (fs.existsSync(loc)) return loc;
		}

		const pathEnv = env['PATH'] ?? '';
		for (const dir of pathEnv.split(path.delimiter)) {
			const candidate = path.join(dir, 'bash.exe');
			if (fs.existsSync(candidate)) return candidate;
		}

		throw new Error(
			'bash not found: checked FLOW_BASH_PATH, known Git for Windows install paths ' +
				'(C:\\Program Files\\Git\\usr\\bin\\bash.exe and similar), and PATH for bash.exe. ' +
				'Install Git Bash or add it to PATH.'
		);
	}

	private resolveUnix(): string {
		try {
			const resolved = execSync('which bash', { encoding: 'utf8' }).trim();
			if (resolved) return resolved;
		} catch {
			// fall through to fail-fast below
		}
		throw new Error("bash not found: checked PATH via 'which bash'. Install bash or add it to PATH.");
	}
}
