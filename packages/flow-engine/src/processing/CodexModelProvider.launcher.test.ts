/**
 * CodexModelProvider starts, ends and looks up processes only through the injected ProcessLauncher
 * (C4 seam). Real child_process functions throw, so a direct use fails the test.
 */
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';
import { CodexModelProvider } from './CodexModelProvider';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

const request = { workingDir: '/workspace', prompt: 'do something', stepId: 'step-1' };

describe('CodexModelProvider -- ProcessLauncher seam', () => {
	const originalMockPath = process.env['CODEX_MOCK_PATH'];

	beforeEach(() => {
		process.env['CODEX_MOCK_PATH'] = '/mock/codex';
	});

	afterEach(() => {
		if (originalMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
		else process.env['CODEX_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
	});

	it('has no direct child_process or ProcessTreeKiller import', () => {
		expect(findDirectProcessApiUses(path.join(__dirname, 'CodexModelProvider.ts'))).toEqual([]);
	});

	it('launchBackground and launchInteractive spawn through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const background = createFakeChild(1234);
		const interactive = createFakeChild(1235);
		fake.queueChild(background);
		fake.queueChild(interactive);
		const provider = new CodexModelProvider(fake);

		const first = provider.launchBackground(request);
		background.emit('exit', 0);
		await first;
		const second = provider.launchInteractive(request);
		interactive.emit('exit', 0);
		await second;

		expect(fake.callsOf('spawn').map(call => [call.command, call.options.stdio])).toEqual([
			['/mock/codex', ['ignore', 'pipe', 'pipe']],
			['/mock/codex', 'inherit'],
		]);
	});

	it('kill() ends the tree through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(1234);
		fake.queueChild(child);
		const provider = new CodexModelProvider(fake);

		const done = provider.launchBackground(request);
		provider.kill();
		child.emit('exit', 0);
		await done;

		expect(fake.callsOf('killTree')).toEqual([{ method: 'killTree', pid: 1234, signal: 'SIGKILL' }]);
	});

	it.each([
		['linux', 'which codex'],
		['win32', 'where.exe codex.cmd 2>nul'],
	] as const)('on %s the binary lookup runs `%s` through the launcher', async (platform, command) => {
		delete process.env['CODEX_MOCK_PATH'];
		vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
		const fake = new FakeProcessLauncher();
		fake.lookups.set(command, '/usr/local/bin/codex');
		const child = createFakeChild(1234);
		fake.queueChild(child);

		const done = new CodexModelProvider(fake).launchBackground(request);
		child.emit('exit', 0);
		await done;

		expect(fake.callsOf('lookupExecutable')).toEqual([{ method: 'lookupExecutable', command }]);
	});
});
