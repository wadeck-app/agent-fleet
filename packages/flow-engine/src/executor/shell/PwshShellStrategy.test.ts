import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwshShellStrategy } from './PwshShellStrategy';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('PwshShellStrategy', () => {
	let strategy: PwshShellStrategy;
	let restorePlatform: () => void;

	beforeEach(() => {
		strategy = new PwshShellStrategy();
		vi.mocked(fs.existsSync).mockReturnValue(false);
	});

	afterEach(() => {
		restorePlatform?.();
		vi.restoreAllMocks();
	});

	describe('on Windows', () => {
		beforeEach(() => {
			restorePlatform = mockPlatform('win32');
		});

		it('returns the path from `where.exe pwsh.exe` when found', () => {
			vi.mocked(execSync).mockReturnValue('C:\\Program Files\\PowerShell\\7\\pwsh.exe\n' as unknown as Buffer);

			expect(strategy.resolve({})).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
		});

		it('falls back to the built-in powershell.exe when pwsh is not installed', () => {
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('not found');
			});
			vi.mocked(fs.existsSync).mockImplementation(
				p => p === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
			);

			expect(strategy.resolve({ SystemRoot: 'C:\\Windows' })).toBe(
				'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
			);
		});

		it('throws an actionable error when neither pwsh nor powershell can be found', () => {
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			expect(() => strategy.resolve({ SystemRoot: 'C:\\Windows' })).toThrow(
				/pwsh not found: checked PATH for pwsh\.exe and the built-in Windows PowerShell/
			);
		});
	});

	describe('on Linux/macOS', () => {
		beforeEach(() => {
			restorePlatform = mockPlatform('linux');
		});

		it('returns the path from `which pwsh`', () => {
			vi.mocked(execSync).mockReturnValue('/usr/bin/pwsh\n' as unknown as Buffer);

			expect(strategy.resolve({})).toBe('/usr/bin/pwsh');
		});

		it('throws an actionable error when `which pwsh` fails, with no powershell fallback', () => {
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			expect(() => strategy.resolve({})).toThrow(/pwsh not found: checked PATH via 'which pwsh'/);
			expect(() => strategy.resolve({})).not.toThrow(/powershell/);
		});
	});
});
