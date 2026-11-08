/**
 * Pins the host behaviour of BashShellStrategy with the real default launcher (only node:child_process is mocked),
 * so the move of the lookup behind ProcessLauncher.lookupExecutable cannot change it.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BashShellStrategy } from './BashShellStrategy';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('BashShellStrategy -- host characterization', () => {
	let restorePlatform: () => void;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		restorePlatform?.();
		vi.restoreAllMocks();
	});

	it('Linux: runs exactly `which bash` and trims the answer', () => {
		restorePlatform = mockPlatform('linux');
		vi.mocked(execSync).mockReturnValue('  /usr/bin/bash \n' as unknown as Buffer);

		expect(new BashShellStrategy().resolve({})).toBe('/usr/bin/bash');
		expect(vi.mocked(execSync).mock.calls.map(call => call[0])).toEqual(['which bash']);
	});

	it('Linux: an empty answer is the same actionable error as a failed lookup', () => {
		restorePlatform = mockPlatform('linux');
		vi.mocked(execSync).mockReturnValue('\n' as unknown as Buffer);

		expect(() => new BashShellStrategy().resolve({})).toThrow(
			"bash not found: checked PATH via 'which bash'. Install bash or add it to PATH."
		);
	});

	it('Windows: never runs a command, pinned path wins over Git locations, WSL System32 bash is never chosen', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(fs.existsSync).mockImplementation(
			p =>
				p === 'C:\\pinned\\bash.exe' ||
				p === 'C:\\Program Files\\Git\\usr\\bin\\bash.exe' ||
				p === 'C:\\Windows\\System32\\bash.exe'
		);
		const env = { FLOW_BASH_PATH: 'C:\\pinned\\bash.exe', PATH: 'C:\\Windows\\System32' };

		expect(new BashShellStrategy().resolve(env)).toBe('C:\\pinned\\bash.exe');
		expect(new BashShellStrategy().resolve({ PATH: 'C:\\Windows\\System32' })).toBe(
			'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
		);
		expect(execSync).not.toHaveBeenCalled();
	});

	it('Windows: an unusable pin falls through to the known locations in order', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(fs.existsSync).mockImplementation(
			p => p === 'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe' || p === 'C:\\Program Files\\Git\\bin\\bash.exe'
		);

		expect(new BashShellStrategy().resolve({ FLOW_BASH_PATH: 'C:\\gone\\bash.exe' })).toBe(
			'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe'
		);
	});

	it('Windows: exact error text when nothing is found', () => {
		restorePlatform = mockPlatform('win32');
		vi.mocked(fs.existsSync).mockReturnValue(false);

		expect(() => new BashShellStrategy().resolve({})).toThrow(
			'bash not found: checked FLOW_BASH_PATH, known Git for Windows install paths ' +
				'(C:\\Program Files\\Git\\usr\\bin\\bash.exe and similar), and PATH for bash.exe. ' +
				'Install Git Bash or add it to PATH.'
		);
	});
});
