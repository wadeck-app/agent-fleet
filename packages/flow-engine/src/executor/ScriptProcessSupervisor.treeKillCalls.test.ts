/**
 * Characterization of the OS-level calls behind the script supervisor's timeout and shutdown kills.
 *
 * Pins today's kill sequence (which process-tree primitive is called, with which arguments, in which
 * order) so that routing kill/timeout/exit-time kill through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) is provably behavior-preserving. Both platform
 * branches are exercised by stubbing `process.platform`.
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { killAllRunningScripts, superviseScriptProcess } from './ScriptProcessSupervisor';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});

const PID = 4242;

/** Every child made by a test: ended in afterEach so the supervisor's module-level registry starts empty. */
const created: child_process.ChildProcess[] = [];

function makeChild(pid: number | null = PID): child_process.ChildProcess {
	const child = new EventEmitter() as unknown as Record<string, unknown>;
	child['pid'] = pid ?? undefined;
	child['kill'] = vi.fn();
	child['exitCode'] = null;
	child['stdout'] = new EventEmitter();
	child['stderr'] = new EventEmitter();
	const typed = child as unknown as child_process.ChildProcess;
	created.push(typed);
	return typed;
}

function spawnSyncCalls(): unknown[][] {
	return vi.mocked(child_process.spawnSync).mock.calls as unknown[][];
}

describe('ScriptProcessSupervisor -- kill calls', () => {
	let processKill: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		// "pgrep" answers: no children; "taskkill" answers: success.
		vi.mocked(child_process.spawnSync).mockReturnValue({
			status: 0,
			stdout: '',
			stderr: '',
			error: undefined,
		} as unknown as ReturnType<typeof child_process.spawnSync>);
		processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
	});

	afterEach(() => {
		for (const child of created.splice(0)) {
			child.emit('close', 0);
		}
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('on Windows', () => {
		beforeEach(() => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
		});

		it('a timeout runs `taskkill /PID <pid> /T /F` synchronously with utf8 + windowsHide, never process.kill', async () => {
			const notices: string[] = [];
			const outcome = superviseScriptProcess(makeChild(), { timeoutMs: 1000, onNotice: m => notices.push(m) });

			await vi.advanceTimersByTimeAsync(1000);

			expect(spawnSyncCalls()).toEqual([
				['taskkill', ['/PID', String(PID), '/T', '/F'], { encoding: 'utf8', windowsHide: true }],
			]);
			expect(processKill).not.toHaveBeenCalled();
			expect(notices).toHaveLength(1);
			expect(notices[0]).toContain('timed out after 1s');
			void outcome;
		});

		it('the escalation after the grace period runs taskkill again (there is no graceful step)', async () => {
			void superviseScriptProcess(makeChild(), { timeoutMs: 1000, terminationGraceMs: 500, onNotice: () => {} });

			await vi.advanceTimersByTimeAsync(1000);
			expect(spawnSyncCalls()).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(500);

			expect(spawnSyncCalls()).toHaveLength(2);
			expect(spawnSyncCalls()[1]![0]).toBe('taskkill');
		});

		it('the exit-time kill (killAllRunningScripts) runs taskkill for a script still running', () => {
			void superviseScriptProcess(makeChild(), { onNotice: () => {} });

			killAllRunningScripts();

			expect(spawnSyncCalls()).toEqual([
				['taskkill', ['/PID', String(PID), '/T', '/F'], { encoding: 'utf8', windowsHide: true }],
			]);
		});
	});

	describe('on POSIX', () => {
		beforeEach(() => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		});

		it('a timeout snapshots descendants with `pgrep -P`, then sends SIGTERM to the pid', async () => {
			void superviseScriptProcess(makeChild(), { timeoutMs: 1000, onNotice: () => {} });

			await vi.advanceTimersByTimeAsync(1000);

			const pgrepCalls = spawnSyncCalls().filter(call => call[0] === 'pgrep');
			expect(pgrepCalls.length).toBeGreaterThan(0);
			expect(pgrepCalls[0]).toEqual(['pgrep', ['-P', String(PID)], { encoding: 'utf8' }]);
			expect(processKill).toHaveBeenCalledWith(PID, 'SIGTERM');
			expect(processKill).not.toHaveBeenCalledWith(PID, 'SIGKILL');
		});

		it('after the grace period it sends SIGKILL to the pid and to the descendants captured before SIGTERM', async () => {
			// First lookup (snapshot, pid 4242) finds child 5001; the lookups for 5001 find nothing.
			vi.mocked(child_process.spawnSync).mockImplementation(((_cmd: string, args: string[]) => ({
				status: 0,
				stdout: args[1] === String(PID) ? '5001\n' : '',
				stderr: '',
				error: undefined,
			})) as unknown as typeof child_process.spawnSync);
			void superviseScriptProcess(makeChild(), { timeoutMs: 1000, terminationGraceMs: 500, onNotice: () => {} });

			await vi.advanceTimersByTimeAsync(1000);
			expect(processKill).toHaveBeenCalledWith(5001, 'SIGTERM');
			expect(processKill).toHaveBeenCalledWith(PID, 'SIGTERM');
			await vi.advanceTimersByTimeAsync(500);

			expect(processKill).toHaveBeenCalledWith(PID, 'SIGKILL');
			expect(processKill).toHaveBeenCalledWith(5001, 'SIGKILL');
		});

		it('the exit-time kill sends SIGKILL to the tree of a script still running', () => {
			void superviseScriptProcess(makeChild(), { onNotice: () => {} });

			killAllRunningScripts();

			expect(processKill).toHaveBeenCalledWith(PID, 'SIGKILL');
		});

		it('clears the running set: a second call does not signal the same tree again, and the script still settles later', async () => {
			const child = makeChild();
			const outcome = superviseScriptProcess(child, { onNotice: () => {} });

			killAllRunningScripts();
			expect(processKill).toHaveBeenCalledWith(PID, 'SIGKILL');
			processKill.mockClear();
			killAllRunningScripts();

			expect(processKill).not.toHaveBeenCalled();
			// Settling after the clear removes the script a second time: that must be harmless.
			child.emit('close', null);
			await expect(outcome).resolves.toEqual({ code: null, timedOut: false });
		});

		it('does not touch the process tree of a script that has already ended', async () => {
			const child = makeChild();
			const outcome = superviseScriptProcess(child, { onNotice: () => {} });
			child.emit('close', 0);
			await outcome;

			killAllRunningScripts();

			expect(processKill).not.toHaveBeenCalled();
			expect(spawnSyncCalls()).toEqual([]);
		});
	});

	it('a child without a pid is ended with child.kill(signal) instead of the tree primitives', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		const child = makeChild(null);
		void superviseScriptProcess(child, { timeoutMs: 1000, onNotice: () => {} });

		await vi.advanceTimersByTimeAsync(1000);

		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
		expect(spawnSyncCalls()).toEqual([]);
	});
});
