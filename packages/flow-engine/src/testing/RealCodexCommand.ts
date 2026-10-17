/**
 * RealCodexCommand -- how tests launch the REAL codex binary without a shell, so argument values
 * containing quotes, brackets and spaces (every `-c key=value` override) reach codex untouched.
 *
 * On Windows `codex` is a `.cmd` shim around `node codex.js`; spawning the shim needs a shell,
 * which re-splits the arguments. This resolves the script behind the shim and runs it with node.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface RealCodexLaunch {
	command: string;
	/** Arguments to put before the codex arguments (the script path on Windows, nothing elsewhere). */
	prefix: string[];
}

export class RealCodexCommand {
	/** @throws when the codex install layout is not the one this knows how to unwrap */
	public static resolve(): RealCodexLaunch {
		if (process.platform === 'win32') {
			const cmdPath = execSync('where.exe codex.cmd', { encoding: 'utf8' }).trim().split('\n')[0]!.trim();
			const codexJs = join(dirname(cmdPath), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
			if (!existsSync(codexJs)) {
				throw new Error(
					`codex.js not found at ${codexJs}; the codex install layout changed, update RealCodexCommand.resolve()`
				);
			}
			return { command: process.execPath, prefix: [codexJs] };
		}
		return { command: 'codex', prefix: [] };
	}
}
