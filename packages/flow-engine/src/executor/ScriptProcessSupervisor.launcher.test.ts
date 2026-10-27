/**
 * ScriptProcessSupervisor reaches the operating system only through the injected ProcessLauncher
 * (C4 seam). Real child_process is replaced by functions that throw, so a direct use fails the test.
 */
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';
import { killAllRunningScripts, superviseScriptProcess } from './ScriptProcessSupervisor';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

function makeChild(): ChildProcess {
	return createFakeChild(77);
}

describe('ScriptProcessSupervisor -- ProcessLauncher seam', () => {
	const created: ChildProcess[] = [];

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		for (const child of created.splice(0)) child.emit('close', 0);
		vi.useRealTimers();
	});

	it('has no direct child_process or ProcessTreeKiller import', () => {
		expect(findDirectProcessApiUses(path.join(__dirname, 'ScriptProcessSupervisor.ts'))).toEqual([]);
	});

	it('timeout: snapshot, SIGTERM tree kill, then SIGKILL tree kill and descendant signals, all through the launcher', async () => {
		const launcher = new FakeProcessLauncher();
		const child = makeChild();
		created.push(child);
		const outcome = superviseScriptProcess(child, {
			timeoutMs: 1000,
			onNotice: () => undefined,
			terminationGraceMs: 500,
			launcher,
		});

		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(500);

		expect(launcher.calls.map(call => call.method)).toEqual([
			'snapshotDescendants',
			'killTree',
			'killTree',
			'signalProcesses',
		]);
		expect(launcher.callsOf('killTree').map(call => [call.pid, call.signal])).toEqual([
			[77, 'SIGTERM'],
			[77, 'SIGKILL'],
		]);
		child.emit('close', null);
		expect(await outcome).toEqual({ code: null, timedOut: true });
	});

	it('exit-time kill goes through the launcher that spawned the script', () => {
		const launcher = new FakeProcessLauncher();
		const child = makeChild();
		created.push(child);
		void superviseScriptProcess(child, { onNotice: () => undefined, launcher });

		killAllRunningScripts();

		expect(launcher.callsOf('killTree')).toEqual([{ method: 'killTree', pid: 77, signal: 'SIGKILL' }]);
	});

	it('a child without pid is signalled with child.kill and the launcher is not asked to kill a tree', async () => {
		const launcher = new FakeProcessLauncher();
		const child = new EventEmitter() as unknown as ChildProcess;
		Object.assign(child, { pid: undefined, kill: vi.fn() });
		created.push(child);
		void superviseScriptProcess(child, { timeoutMs: 10, onNotice: () => undefined, launcher });

		await vi.advanceTimersByTimeAsync(10);

		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
		expect(launcher.calls).toEqual([]);
	});
});
