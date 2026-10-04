import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ShellStrategy } from './ShellStrategy';

/**
 * cmd.exe only exists on Windows -- there is no equivalent binary to fall back to on
 * Linux/macOS, so this strategy rejects immediately rather than attempting any resolution.
 */
export class CmdShellStrategy implements ShellStrategy {
	public resolve(env: NodeJS.ProcessEnv): string {
		if (process.platform !== 'win32') {
			throw new Error(
				`shell: cmd is Windows-only but this worker is running on '${process.platform}'. ` +
					'Use shell: bash or shell: pwsh instead.'
			);
		}

		const systemRoot = env['SystemRoot'] ?? env['SYSTEMROOT'] ?? 'C:\\Windows';
		const cmdPath = path.join(systemRoot, 'System32', 'cmd.exe');
		if (fs.existsSync(cmdPath)) return cmdPath;

		throw new Error(`cmd not found: checked ${cmdPath} (via SystemRoot). Verify the Windows installation is intact.`);
	}
}
