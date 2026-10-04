import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ShellStrategy } from './ShellStrategy';

/**
 * Resolves PowerShell: prefers PowerShell Core (pwsh) everywhere, and on Windows falls back to
 * the Windows PowerShell (powershell.exe) that ships with every install when Core isn't present.
 * No such fallback exists on Linux/macOS -- powershell.exe is a Windows-only binary.
 */
export class PwshShellStrategy implements ShellStrategy {
	public resolve(env: NodeJS.ProcessEnv): string {
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
		try {
			const resolved = execSync('which pwsh', { encoding: 'utf8' }).trim();
			if (resolved) return resolved;
		} catch {
			// fall through to fail-fast below
		}
		throw new Error("pwsh not found: checked PATH via 'which pwsh'. Install PowerShell 7+ (pwsh) or add it to PATH.");
	}

	private whereExe(binary: string): string | null {
		try {
			const resolved = execSync(`where.exe ${binary}`, { encoding: 'utf8' })
				.trim()
				.split('\n')[0]
				?.trim();
			return resolved || null;
		} catch {
			return null;
		}
	}
}
