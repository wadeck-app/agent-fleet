import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKER_FEATURE_SECRETS, WORKER_FEATURE_SUB_STEP_SESSION_RESUME } from '../ipc/Protocol.js';
import { buildForkedWorkerReady } from './WorkerLaunch.js';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('buildForkedWorkerReady', () => {
	let originalPlatform: PropertyDescriptor | undefined;

	beforeEach(() => {
		originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
		Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
	});

	afterEach(() => {
		if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
		vi.restoreAllMocks();
	});

	it('declares the shells the forked worker can run, so a `shell:` step can be routed to it', () => {
		vi.mocked(fs.existsSync).mockImplementation(
			p => p === 'C:\\Program Files\\Git\\usr\\bin\\bash.exe' || p === 'C:\\Windows\\System32\\cmd.exe'
		);
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('not found');
		});

		const ready = buildForkedWorkerReady({}, 4242);

		expect(ready.pid).toBe(4242);
		expect(ready.shellCapabilities).toEqual(['bash', 'cmd']);
	});

	it('declares the protocol features of this build', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('not found');
		});

		const ready = buildForkedWorkerReady({}, 1);

		expect(ready.features).toEqual([WORKER_FEATURE_SUB_STEP_SESSION_RESUME, WORKER_FEATURE_SECRETS]);
		expect(ready.shellCapabilities).toEqual([]);
	});
});
