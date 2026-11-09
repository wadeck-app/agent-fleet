/**
 * The Windows branches of the shell strategies must build Windows paths (backslashes, `;` PATH delimiter) whatever the
 * host `node:path` flavour is. Here `node:path` is the POSIX flavour (as on a Linux CI runner) while the platform is
 * stubbed to win32: before the fix `path.join` produced `C:\Windows/System32/cmd.exe` and `path.delimiter` was `:`.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BashShellStrategy } from './BashShellStrategy';
import { CmdShellStrategy } from './CmdShellStrategy';
import { PwshShellStrategy } from './PwshShellStrategy';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:path', async importOriginal => {
	const actual = await importOriginal<typeof import('node:path')>();
	return { ...actual.posix, posix: actual.posix, win32: actual.win32, default: actual.posix };
});

describe('Windows shell strategies on a host whose node:path is POSIX', () => {
	let restorePlatform: () => void;

	beforeEach(() => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(fs.existsSync).mockReturnValue(false);
	});

	afterEach(() => {
		restorePlatform();
		vi.restoreAllMocks();
	});

	it('bash: scans a `;`-separated PATH and joins with a backslash', () => {
		vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\custom\\dir\\bash.exe');

		expect(new BashShellStrategy().resolve({ PATH: 'C:\\other;C:\\custom\\dir' })).toBe(
			'C:\\custom\\dir\\bash.exe'
		);
	});

	it('cmd: joins SystemRoot with backslashes, in the result and in the error', () => {
		vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\Windows\\System32\\cmd.exe');
		expect(new CmdShellStrategy().resolve({ SystemRoot: 'C:\\Windows' })).toBe('C:\\Windows\\System32\\cmd.exe');

		vi.mocked(fs.existsSync).mockReturnValue(false);
		expect(() => new CmdShellStrategy().resolve({ SystemRoot: 'C:\\Windows' })).toThrow(
			'cmd not found: checked C:\\Windows\\System32\\cmd.exe (via SystemRoot).'
		);
	});

	it('pwsh: falls back to powershell.exe joined with backslashes, and names that path in the error', () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('nope');
		});
		const expected = 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
		vi.mocked(fs.existsSync).mockImplementation(p => p === expected);
		expect(new PwshShellStrategy().resolve({ SYSTEMROOT: 'D:\\Win' })).toBe(expected);

		vi.mocked(fs.existsSync).mockReturnValue(false);
		expect(() => new PwshShellStrategy().resolve({ SYSTEMROOT: 'D:\\Win' })).toThrow(
			`built-in Windows PowerShell at ${expected}.`
		);
	});
});
