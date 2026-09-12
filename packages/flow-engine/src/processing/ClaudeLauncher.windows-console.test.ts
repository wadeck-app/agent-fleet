/**
 * Windows console inheritance tests for ClaudeLauncher.
 *
 * CREATE_NO_WINDOW (windowsHide:true) and DETACHED_PROCESS (detached:true) remove the
 * console handle from the spawned process, breaking the inheritance chain. A consoleless
 * claude process calls AllocConsole() -> Windows Terminal shows a visible tab (regression
 * fixed by d032e7e + b2bca73).
 *
 * The claude process must inherit the daemon's hidden console (created via wscript.exe
 * SW_HIDE in spawnDaemonBackground), so neither flag may be set on these spawns.
 *
 * Companion tests: packages/flow-cli/src/daemon/WorkerPool.windows-console.test.ts
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeLauncher } from './ClaudeLauncher';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), execSync: vi.fn(() => '/usr/local/bin/claude\n') };
});

/** Minimal ChildProcess stub: emits 'close' on next tick so the launch promise settles. */
function makeMockChild(withPipes: boolean): ChildProcess {
	const emitter = new EventEmitter();
	const child = emitter as unknown as ChildProcess;
	const record = child as unknown as Record<string, unknown>;
	record['pid'] = 1234;
	if (withPipes) {
		record['stdin'] = { write: vi.fn(), end: vi.fn() };
		record['stdout'] = new EventEmitter();
		record['stderr'] = new EventEmitter();
	}
	setImmediate(() => emitter.emit('close', 0));
	return child;
}

function spawnOptions(): Record<string, unknown> {
	expect(spawn).toHaveBeenCalledOnce();
	return vi.mocked(spawn).mock.calls[0]![2] as unknown as Record<string, unknown>;
}

describe('ClaudeLauncher — Windows console inheritance (no windowsHide/detached on spawns)', () => {
	let launcher: ClaudeLauncher;

	beforeEach(() => {
		launcher = new ClaudeLauncher();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('launchInteractive', () => {
		beforeEach(() => {
			vi.mocked(spawn).mockImplementation(() => makeMockChild(false));
		});

		it('does NOT set windowsHide:true — claude must inherit the parent console', async () => {
			await launcher.launchInteractive({ workingDir: '/tmp', prompt: 'hello', stepId: 'step-1' });

			// If present and true it would set CREATE_NO_WINDOW, breaking console inheritance.
			expect(spawnOptions()['windowsHide']).not.toBe(true);
		});

		it('does NOT set detached:true — DETACHED_PROCESS removes the console handle', async () => {
			await launcher.launchInteractive({ workingDir: '/tmp', prompt: 'hello', stepId: 'step-1' });

			expect(spawnOptions()['detached']).not.toBe(true);
		});
	});

	describe('launchBackground', () => {
		beforeEach(() => {
			vi.mocked(spawn).mockImplementation(() => makeMockChild(true));
		});

		it('does NOT set windowsHide:true — claude must inherit the parent console', async () => {
			await launcher.launchBackground({ workingDir: '/tmp', prompt: 'hello', stepId: 'step-1' });

			expect(spawnOptions()['windowsHide']).not.toBe(true);
		});

		it('does NOT set detached:true — DETACHED_PROCESS removes the console handle', async () => {
			await launcher.launchBackground({ workingDir: '/tmp', prompt: 'hello', stepId: 'step-1' });

			expect(spawnOptions()['detached']).not.toBe(true);
		});
	});
});
