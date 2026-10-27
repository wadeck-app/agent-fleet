/**
 * CompactHook starts and ends its command only through the injected ProcessLauncher (C4 seam).
 * Real child_process functions throw, so a direct use fails the test.
 */
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';
import { runCompactHook } from './CompactHook';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

function hookParams(launcher: FakeProcessLauncher, timeoutMs = 60_000) {
	return {
		command: 'echo compacted',
		timeoutMs,
		cwd: '/workspace',
		env: { PATH: '/bin' },
		event: { event: 'thrashing' } as const,
		context: { stepId: 'step-1' },
		onWarning: vi.fn(),
		launcher,
	};
}

describe('CompactHook -- ProcessLauncher seam', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('has no direct child_process or ProcessTreeKiller import', () => {
		expect(findDirectProcessApiUses(path.join(__dirname, 'CompactHook.ts'))).toEqual([]);
	});

	it('spawns the command string through the launcher', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(321);
		fake.queueChild(child);

		const done = runCompactHook(hookParams(fake));
		child.emit('close', 0);
		await done;

		expect(fake.calls.map(call => call.method)).toEqual(['spawn']);
		const [spawnCall] = fake.callsOf('spawn');
		expect(spawnCall?.command).toBe('echo compacted');
		expect(spawnCall?.args).toBeUndefined();
		expect(spawnCall?.options.shell).toBe(true);
	});

	it('a timeout ends the tree through killTreeAndWait and resolves once it is done', async () => {
		vi.useFakeTimers();
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(321);
		fake.queueChild(child);
		const params = hookParams(fake, 1000);

		const done = runCompactHook(params);
		await vi.advanceTimersByTimeAsync(1000);
		await done;

		expect(fake.callsOf('killTreeAndWait')).toEqual([{ method: 'killTreeAndWait', child }]);
		expect(params.onWarning).toHaveBeenCalledWith(expect.stringContaining('timed out after 1s'));
	});

	it('a spawn failure is reported as a warning, never thrown', async () => {
		const fake = new FakeProcessLauncher();
		const child = createFakeChild(321);
		fake.queueChild(child);
		const params = hookParams(fake);

		const done = runCompactHook(params);
		child.emit('error', new Error('ENOENT'));
		await done;

		expect(params.onWarning).toHaveBeenCalledWith(expect.stringContaining('could not be started: ENOENT'));
	});
});
