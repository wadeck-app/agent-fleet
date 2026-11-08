import * as fs from 'node:fs';
import * as path from 'node:path';

import { DefaultProcessLauncher } from '../../processing/DefaultProcessLauncher';
import type { ProcessLauncher } from '../../processing/ProcessLauncher';
import { LauncherShellLookup } from './LauncherShellLookup';
import type { ShellStrategy } from './ShellStrategy';

/**
 * Resolves PowerShell: prefers PowerShell Core (pwsh) everywhere, and on Windows falls back to
 * the Windows PowerShell (powershell.exe) that ships with every install when Core isn't present.
 * No such fallback exists on Linux/macOS -- powershell.exe is a Windows-only binary.
 *
 * The lookup goes through the injected {@link ProcessLauncher}. A launcher that runs scripts elsewhere
 * (`isolatesEnvironment`, a sandbox) answers `which pwsh` from where the script runs, whatever the host platform;
 * the host's `where.exe` and powershell.exe are not consulted then.
 */
export class PwshShellStrategy implements ShellStrategy {
	private readonly lookup: LauncherShellLookup;

	constructor(launcher: ProcessLauncher = new DefaultProcessLauncher()) {
		this.lookup = new LauncherShellLookup(launcher);
	}

	public resolve(env: NodeJS.ProcessEnv): string {
		if (this.lookup.runsElsewhere) return this.lookup.whichOrThrow('pwsh');
		return process.platform === 'win32' ? this.resolveWindows(env) : this.resolveUnix();
	}

	private resolveWindows(env: NodeJS.ProcessEnv): string {
		const pwshPath = this.whereExe('pwsh.exe');
		if (pwshPath) return pwshPath;

		const systemRoot = env['SystemRoot'] ?? env['SYSTEMROOT'] ?? 'C:\\Windows';
		const powershellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
		if (fs.existsSync(powershellPath)) return powershellPath;

		throw new Error(
			`pwsh not found: checked PATH for pwsh.exe and the built-in Windows PowerShell at ${powershellPath}. ` +
				'Install PowerShell 7+ (pwsh) or add it to PATH.'
		);
	}

	private resolveUnix(): string {
		const result = this.lookup.lookup('which pwsh');
		if ('found' in result) return result.found;
		throw new Error(
			"pwsh not found: checked PATH via 'which pwsh'. Install PowerShell 7+ (pwsh) or add it to PATH."
		);
	}

	private whereExe(binary: string): string | null {
		// "2>nul" discards at the shell level, not just Node's stdio pipe -- where.exe writes
		// its localized "could not find files" message straight to the console on a miss,
		// bypassing stdio redirection otherwise (confirmed live: leaks even with stdio: 'pipe').
		const result = this.lookup.lookup(`where.exe ${binary} 2>nul`);
		if (!('found' in result)) return null;
		return result.found.split('\n')[0]?.trim() || null;
	}
}
