import { execSync } from 'node:child_process';

export function resolveClaudePath(): string {
	try {
		// "2>nul" discards at the shell level, not just Node's stdio pipe -- where.exe writes its
		// localized "could not find files" message straight to the console on a miss, bypassing
		// the stdio option above (confirmed live: it leaks even with stdio: 'pipe'/'ignore').
		const cmd = process.platform === 'win32' ? 'where.exe claude 2>nul' : 'which claude';
		const result = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
		return result.trim().split('\n')[0]?.trim() ?? '';
	} catch {
		// Claude not found on PATH -- workers will need to locate it themselves
		process.stderr.write('[daemon] Warning: claude binary not found on PATH. Model steps may fail.\n');
		return '';
	}
}
