/**
 * Windows console inheritance tests for WorkerPool.
 *
 * CREATE_NO_WINDOW (windowsHide:true) removes the console handle from the spawned
 * process, breaking the inheritance chain. Children of consoleless workers call
 * AllocConsole() → Windows Terminal shows a visible tab (regression).
 *
 * spawnWorker() must NOT set windowsHide so workers inherit the daemon's hidden
 * WT console (created via wscript.exe SW_HIDE in spawnDaemonBackground).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';

import { WorkerPool } from './WorkerPool';

vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, existsSync: vi.fn() };
});

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn() };
});

function makeMockChild(): ChildProcess {
	const emitter = new EventEmitter();
	const child = emitter as unknown as ChildProcess;
	(child as unknown as Record<string, unknown>).pid = 99;
	(child as unknown as Record<string, unknown>).kill = vi.fn();
	(child as unknown as Record<string, unknown>).killed = false;
	(child as unknown as Record<string, unknown>).stderr = new EventEmitter();
	return child;
}

describe('WorkerPool — Windows console inheritance (no windowsHide on workers)', () => {
	beforeEach(() => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(spawn).mockImplementation(() => makeMockChild());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('spawnWorker() does NOT set windowsHide:true — workers must inherit daemon console', () => {
		vi.useFakeTimers();
		try {
			vi.mocked(existsSync).mockReturnValueOnce(true); // dev mode
			const pool = new WorkerPool(3, 3000, 3001);
			pool.spawnWorker();

			expect(spawn).toHaveBeenCalledOnce();
			const opts = vi.mocked(spawn).mock.calls[0]![2] as Record<string, unknown>;
			// windowsHide must be absent or explicitly false.
			// If present and true it would set CREATE_NO_WINDOW, breaking console inheritance.
			expect(opts['windowsHide']).not.toBe(true);

			const mockChild = vi.mocked(spawn).mock.results[0]!.value as unknown as EventEmitter;
			mockChild.emit('exit');
		} finally {
			vi.useRealTimers();
		}
	});

	it('spawnWorker() does NOT set detached:true — DETACHED_PROCESS removes the console handle', () => {
		vi.useFakeTimers();
		try {
			vi.mocked(existsSync).mockReturnValueOnce(true);
			const pool = new WorkerPool(3, 3000, 3001);
			pool.spawnWorker();

			const opts = vi.mocked(spawn).mock.calls[0]![2] as Record<string, unknown>;
			expect(opts['detached']).not.toBe(true);

			const mockChild = vi.mocked(spawn).mock.results[0]!.value as unknown as EventEmitter;
			mockChild.emit('exit');
		} finally {
			vi.useRealTimers();
		}
	});
});
