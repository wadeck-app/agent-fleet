import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { probeShellCapabilities } from './WorkerLaunch.js';

vi.mock('node:fs');
vi.mock('node:child_process');

/** Isolated from WorkerLaunch.test.ts, which uses the real node:fs for its own fixtures. */
function mockPlatform(platform: NodeJS.Platform): () => void {
	const original = Object.getOwnPropertyDescriptor(process, 'platform');
	Object.defineProperty(process, 'platform', { value: platform, configurable: true });
	return () => {
		if (original) Object.defineProperty(process, 'platform', original);
	};
}

describe('probeShellCapabilities', () => {
	let restorePlatform: () => void;

	beforeEach(() => {
		restorePlatform = mockPlatform('win32');
	});

	afterEach(() => {
		restorePlatform();
		vi.restoreAllMocks();
	});

	it('returns all three when every strategy resolves', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(execSync).mockReturnValue('C:\\pwsh\\pwsh.exe\n');

		expect(probeShellCapabilities({})).toEqual(['bash', 'cmd', 'pwsh']);
	});

	it('omits a shell whose strategy throws, keeping the others', () => {
		// bash.exe found via known Git for Windows path; cmd.exe found via SystemRoot;
		// pwsh fails both the `where.exe pwsh.exe` lookup and the powershell.exe fallback.
		vi.mocked(fs.existsSync).mockImplementation(
			p => p === 'C:\\Program Files\\Git\\usr\\bin\\bash.exe' || p === 'C:\\Windows\\System32\\cmd.exe'
		);
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('not found');
		});

		expect(probeShellCapabilities({})).toEqual(['bash', 'cmd']);
	});

	it('never throws, even when every strategy fails to resolve', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('not found');
		});

		expect(() => probeShellCapabilities({})).not.toThrow();
		expect(probeShellCapabilities({})).toEqual([]);
	});
});
