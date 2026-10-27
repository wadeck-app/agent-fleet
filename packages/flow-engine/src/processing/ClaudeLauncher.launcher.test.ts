/**
 * ClaudeLauncher and ClaudeModelProvider start, end and look up processes only through the injected
 * ProcessLauncher (C4 seam). Real child_process functions throw, so a direct use fails the test.
 */
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';
import { ClaudeLauncher } from './ClaudeLauncher';
import { ClaudeModelProvider } from './ClaudeModelProvider';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

describe('Claude classes -- ProcessLauncher seam', () => {
	const originalMockPath = process.env['CLAUDE_MOCK_PATH'];

	beforeEach(() => {
		process.env['CLAUDE_MOCK_PATH'] = '/mock/claude';
	});

	afterEach(() => {
		if (originalMockPath === undefined) delete process.env['CLAUDE_MOCK_PATH'];
		else process.env['CLAUDE_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it.each(['ClaudeLauncher.ts', 'ClaudeModelProvider.ts'])(
		'%s has no direct child_process or ProcessTreeKiller import',
		file => {
			expect(findDirectProcessApiUses(path.join(__dirname, file))).toEqual([]);
		}
	);

	it('launchBackground spawns through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(888);
		fake.queueChild(child);

		const done = new ClaudeLauncher(fake).launchBackground({ workingDir: '/work', prompt: 'hi', stepId: 's1' });
		child.emit('close', 0);
		await done;

		expect(fake.calls.map(call => call.method)).toEqual(['spawn']);
		expect(fake.callsOf('spawn')[0]?.command).toBe('/mock/claude');
	});

	it('launchInteractive spawns through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(888);
		fake.queueChild(child);

		const done = new ClaudeLauncher(fake).launchInteractive({ workingDir: '/work', prompt: 'hi', stepId: 's1' });
		child.emit('close', 0);
		await done;

		expect(fake.callsOf('spawn')[0]?.options.stdio).toBe('inherit');
	});

	it('the end-of-turn kill goes through the launcher', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(888);
		fake.queueChild(child);

		const done = new ClaudeLauncher(fake).launchBackground({
			workingDir: '/work',
			prompt: 'hi',
			stepId: 's1',
			streamJson: true,
			resultGraceMs: 50,
		});
		child.stdout?.emit(
			'data',
			Buffer.from('{"type":"result","subtype":"success","is_error":false,"result":"ok"}\n')
		);
		await vi.advanceTimersByTimeAsync(50);
		await done;

		expect(fake.callsOf('killTree')).toEqual([{ method: 'killTree', pid: 888, signal: 'SIGKILL' }]);
	});

	it.each([
		['linux', 'which claude'],
		['win32', 'where claude'],
	] as const)('on %s the binary lookup runs `%s` through the launcher', (platform, command) => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
		const fake = new FakeProcessLauncher();
		fake.lookups.set(command, platform === 'win32' ? 'C:\\bin\\claude\nC:\\bin\\claude.cmd' : '/usr/bin/claude');

		const found = new ClaudeLauncher(fake).findClaudePath({});

		expect(fake.callsOf('lookupExecutable')).toEqual([{ method: 'lookupExecutable', command }]);
		expect(found).toBe(platform === 'win32' ? 'C:\\bin\\claude.cmd' : '/usr/bin/claude');
	});

	it('ClaudeModelProvider passes its launcher down and kills the tree through it', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(888);
		fake.queueChild(child);

		const done = new ClaudeModelProvider(fake).launchBackground({
			workingDir: process.cwd(),
			prompt: 'hi',
			stepId: 's1',
		});
		await vi.waitFor(() => expect(fake.callsOf('spawn')).toHaveLength(1));
		child.emit('close', 0);
		await done;

		// The launch `finally` calls kill(); the fake child never set its exit code, so it is still "alive".
		expect(fake.callsOf('killTree')).toEqual([{ method: 'killTree', pid: 888, signal: 'SIGKILL' }]);
	});
});
