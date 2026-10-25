import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findGitBashForOpenCode, resolveOpenCodeShell } from './OpenCodeWindowsShell';

const GIT_BASH = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';

describe('resolveOpenCodeShell', () => {
	it('sets SHELL to the Git Bash path on win32 when it is found', () => {
		const result = resolveOpenCodeShell({}, { platform: 'win32', findGitBash: () => GIT_BASH });
		expect(result).toEqual({ kind: 'set', shell: GIT_BASH });
	});

	it('leaves a SHELL the step already sets alone (step wins)', () => {
		const result = resolveOpenCodeShell(
			{ SHELL: 'C:\\Tools\\pwsh.exe' },
			{
				platform: 'win32',
				findGitBash: () => {
					throw new Error('must not look for bash when SHELL is set');
				},
			}
		);
		expect(result).toEqual({ kind: 'step-provided' });
	});

	it('does nothing on non-win32 platforms', () => {
		const result = resolveOpenCodeShell({}, { platform: 'linux', findGitBash: () => GIT_BASH });
		expect(result).toEqual({ kind: 'not-applicable' });
	});

	it('reports not-found, without guessing, when Git Bash cannot be located', () => {
		const result = resolveOpenCodeShell({}, { platform: 'win32', findGitBash: () => null });
		expect(result).toEqual({ kind: 'not-found' });
	});
});

describe('findGitBashForOpenCode', () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-shell-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('returns the FLOW_BASH_PATH pin when it exists', () => {
		const pinned = path.join(dir, 'bash.exe');
		fs.writeFileSync(pinned, '');
		expect(findGitBashForOpenCode({ FLOW_BASH_PATH: pinned })).toBe(pinned);
	});

	it('rejects the bare "bash" last resort of resolveBashOnWindows', () => {
		// Pin to a missing file and an empty PATH: only the well-known Git locations can match, and
		// when they do not exist the helper must say null rather than return "bash".
		const found = findGitBashForOpenCode({ FLOW_BASH_PATH: path.join(dir, 'nope.exe'), PATH: dir });
		if (found !== null) {
			expect(path.isAbsolute(found)).toBe(true);
		}
	});

	it('rejects the WSL bash stub in System32', () => {
		const system32 = path.join(dir, 'Windows', 'System32');
		fs.mkdirSync(system32, { recursive: true });
		fs.writeFileSync(path.join(system32, 'bash.exe'), '');
		const found = findGitBashForOpenCode({ FLOW_BASH_PATH: '', PATH: system32 });
		expect(found === null || !found.toLowerCase().includes('system32')).toBe(true);
	});
});
