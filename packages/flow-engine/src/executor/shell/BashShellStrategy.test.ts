import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BashShellStrategy } from './BashShellStrategy';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('BashShellStrategy', () => {
	let strategy: BashShellStrategy;
	let restorePlatform: () => void;

	beforeEach(() => {
		strategy = new BashShellStrategy();
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

		it('returns the pinned FLOW_BASH_PATH when it exists', () => {
			vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\pinned\\bash.exe');

			expect(strategy.resolve({ FLOW_BASH_PATH: 'C:\\pinned\\bash.exe' })).toBe('C:\\pinned\\bash.exe');
		});

		it('falls back to a known Git for Windows install path', () => {
			vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\Program Files\\Git\\usr\\bin\\bash.exe');

			expect(strategy.resolve({})).toBe('C:\\Program Files\\Git\\usr\\bin\\bash.exe');
		});

		it('falls back to scanning PATH for bash.exe', () => {
			vi.mocked(fs.existsSync).mockImplementation(p => p === 'C:\\custom\\dir\\bash.exe');

			expect(strategy.resolve({ PATH: 'C:\\other;C:\\custom\\dir' })).toBe('C:\\custom\\dir\\bash.exe');
		});

		it('throws an actionable error when bash.exe cannot be found anywhere', () => {
			expect(() => strategy.resolve({ PATH: 'C:\\nowhere' })).toThrow(
				/bash not found: checked FLOW_BASH_PATH, known Git for Windows install paths.*PATH for bash\.exe/
			);
		});
	});

	describe('on Linux/macOS', () => {
		beforeEach(() => {
			restorePlatform = mockPlatform('linux');
		});

		it('returns the path from `which bash`', () => {
			vi.mocked(execSync).mockReturnValue('/usr/bin/bash\n' as unknown as Buffer);

			expect(strategy.resolve({})).toBe('/usr/bin/bash');
		});

		it('throws an actionable error when `which bash` fails', () => {
			vi.mocked(execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			expect(() => strategy.resolve({})).toThrow(/bash not found: checked PATH via 'which bash'/);
		});
	});
});
