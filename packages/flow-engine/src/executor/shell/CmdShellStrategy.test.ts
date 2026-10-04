import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CmdShellStrategy } from './CmdShellStrategy';

vi.mock('node:fs');

describe('CmdShellStrategy', () => {
	let strategy: CmdShellStrategy;
	let restorePlatform: () => void;

	beforeEach(() => {
		strategy = new CmdShellStrategy();
	});

	afterEach(() => {
		restorePlatform?.();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	describe('on Windows', () => {
		beforeEach(() => {
			restorePlatform = mockPlatform('win32');
		});

		it('returns cmd.exe under SystemRoot\\System32 when it exists', () => {
			vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\Windows\\System32\\cmd.exe');

			expect(strategy.resolve({ SystemRoot: 'C:\\Windows' })).toBe('C:\\Windows\\System32\\cmd.exe');
		});

		it('defaults SystemRoot to C:\\Windows when the env var is absent', () => {
			vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\Windows\\System32\\cmd.exe');

			expect(strategy.resolve({})).toBe('C:\\Windows\\System32\\cmd.exe');
		});

		it('throws an actionable error when cmd.exe is missing', () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(() => strategy.resolve({ SystemRoot: 'C:\\Windows' })).toThrow(
				/cmd not found: checked C:\\Windows\\System32\\cmd\.exe/
			);
		});
	});

	describe('on Linux/macOS', () => {
		beforeEach(() => {
			restorePlatform = mockPlatform('linux');
		});

		it('rejects immediately without touching the filesystem', () => {
			expect(() => strategy.resolve({})).toThrow(/shell: cmd is Windows-only.*linux/);
			expect(fs.existsSync).not.toHaveBeenCalled();
		});
	});
});
