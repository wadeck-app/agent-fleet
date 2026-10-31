/**
 * Decides which opencode binary a step runs. Shared by OpenCodeModelProvider and by
 * ProviderFlagContract.test.ts, so the contract is checked against the install the provider uses and
 * not against whichever `opencode` comes first in the test runner's PATH.
 *
 * OPENCODE_MOCK_PATH overrides resolution (tests, and a per-step mock overlay in `env`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ProcessLauncher } from './ProcessLauncher';

export interface ResolvedOpenCodeCommand {
	/** Executable first, then any prefix arguments (e.g. `['node', '/path/mock.mjs']`). */
	parts: string[];
	needsShell: boolean;
	/** True when OPENCODE_MOCK_PATH chose the binary: a mock accepts any flag, so nothing can be probed. */
	isMock: boolean;
}

export function resolveOpenCodeCommand(env: NodeJS.ProcessEnv, launcher: ProcessLauncher): ResolvedOpenCodeCommand {
	const mockPath = env['OPENCODE_MOCK_PATH'];
	if (mockPath) {
		// .mjs/.js files are not directly executable -- run via node
		if (mockPath.endsWith('.mjs') || mockPath.endsWith('.js')) {
			return { parts: ['node', mockPath], needsShell: false, isMock: true };
		}
		return { parts: [mockPath], needsShell: false, isMock: true };
	}
	if (process.platform === 'win32') {
		// On Windows, find the real opencode.exe next to opencode.cmd in the npm global bin dir.
		// shell:true with complex prompts (newlines, backticks) is unreliable on Windows cmd.exe.
		try {
			// "2>nul" discards at the shell level -- where.exe writes its localized "could not
			// find files" message straight to the console on a miss, bypassing stdio redirection.
			const cmdPath = launcher.lookupExecutable('where.exe opencode.cmd 2>nul').trim().split('\n')[0]!.trim();
			const dir = path.dirname(cmdPath);
			const exePath = path.join(dir, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
			if (fs.existsSync(exePath)) {
				return { parts: [exePath], needsShell: false, isMock: false };
			}
		} catch {
			// fall through to shell:true fallback
		}
		// Accepted risk: shell:true fallback (documented in out-of-scope.md)
		return { parts: ['opencode'], needsShell: true, isMock: false };
	}
	try {
		return { parts: [launcher.lookupExecutable('which opencode')], needsShell: false, isMock: false };
	} catch {
		return { parts: ['opencode'], needsShell: false, isMock: false };
	}
}
