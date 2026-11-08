/**
 * Pins the host behaviour of PwshShellStrategy with the real default launcher (only node:child_process is mocked),
 * so the move of the lookup behind ProcessLauncher.lookupExecutable cannot change it.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwshShellStrategy } from './PwshShellStrategy';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('PwshShellStrategy -- host characterization', () => {
	let restorePlatform: () => void;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		restorePlatform?.();
		vi.restoreAllMocks();
	});

	it('Windows: runs `where.exe pwsh.exe 2>nul` and keeps the first line', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(execSync).mockReturnValue('C:\\a\\pwsh.exe\r\nC:\\b\\pwsh.exe\r\n' as unknown as Buffer);

		expect(new PwshShellStrategy().resolve({})).toBe('C:\\a\\pwsh.exe');
		expect(vi.mocked(execSync).mock.calls.map(call => call[0])).toEqual(['where.exe pwsh.exe 2>nul']);
	});

	it('Windows: an empty where answer falls back to powershell.exe under SYSTEMROOT', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(execSync).mockReturnValue('\n' as unknown as Buffer);
		vi.mocked(fs.existsSync).mockImplementation(
			p => p === 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
		);

		expect(new PwshShellStrategy().resolve({ SYSTEMROOT: 'D:\\Win' })).toBe(
			'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
		);
	});

	it('Windows: exact error text when neither is found', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('nope');
		});
		vi.mocked(fs.existsSync).mockReturnValue(false);

		expect(() => new PwshShellStrategy().resolve({ SystemRoot: 'C:\\Windows' })).toThrow(
			'pwsh not found: checked PATH for pwsh.exe and the built-in Windows PowerShell at ' +
				'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe. ' +
				'Install PowerShell 7+ (pwsh) or add it to PATH.'
		);
	});

	it('Linux: runs exactly `which pwsh` and trims the answer', () => {
		restorePlatform = mockPlatform('linux');
		vi.mocked(execSync).mockReturnValue(' /usr/bin/pwsh\n' as unknown as Buffer);

		expect(new PwshShellStrategy().resolve({})).toBe('/usr/bin/pwsh');
		expect(vi.mocked(execSync).mock.calls.map(call => call[0])).toEqual(['which pwsh']);
	});

	it('Linux: exact error text when the lookup fails', () => {
		restorePlatform = mockPlatform('linux');
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('nope');
		});

		expect(() => new PwshShellStrategy().resolve({})).toThrow(
			"pwsh not found: checked PATH via 'which pwsh'. Install PowerShell 7+ (pwsh) or add it to PATH."
		);
	});
});
