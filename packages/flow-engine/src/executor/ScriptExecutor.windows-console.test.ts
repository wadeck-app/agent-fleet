/**
 * Windows console inheritance tests for ScriptExecutor.
 *
 * CREATE_NO_WINDOW (windowsHide:true) and DETACHED_PROCESS (detached:true) remove the
 * console handle from the spawned process, breaking the inheritance chain. Children of
 * consoleless processes call AllocConsole() -> Windows Terminal shows a visible tab
 * (regression fixed in d032e7e).
 *
 * Every spawn in ScriptExecutor must therefore inherit the daemon's hidden console
 * (created via wscript.exe SW_HIDE in spawnDaemonBackground) instead of hiding itself.
 *
 * Companion tests: packages/flow-cli/src/daemon/WorkerPool.windows-console.test.ts
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptExecutor } from './ScriptExecutor';

vi.mock('child_process');

interface MockChild extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: () => void;
	killed: boolean;
}

function makeMockChild(): MockChild {
	const child = new EventEmitter() as MockChild;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	child.killed = false;
	return child;
}

describe('ScriptExecutor - Windows console inheritance (no windowsHide / detached)', () => {
	let executor: ScriptExecutor;
	let mockChild: MockChild;

	beforeEach(() => {
		// The module-level automock persists between tests, so its call list must be reset
		vi.clearAllMocks();
		executor = new ScriptExecutor();
		mockChild = makeMockChild();
		vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild as unknown as child_process.ChildProcess);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function spawnOptions(callIndex = 0): Record<string, unknown> {
		const call = vi.mocked(child_process.spawn).mock.calls[callIndex];
		expect(call).toBeDefined();
		return call![2] as unknown as Record<string, unknown>;
	}

	it('single-line script spawn does NOT set windowsHide:true', async () => {
		const executePromise = executor.execute({ script: 'echo test' });
		mockChild.emit('close', 0);
		await executePromise;

		expect(spawnOptions()['windowsHide']).not.toBe(true);
	});

	it('single-line script spawn does NOT set detached:true', async () => {
		const executePromise = executor.execute({ script: 'echo test' });
		mockChild.emit('close', 0);
		await executePromise;

		expect(spawnOptions()['detached']).not.toBe(true);
	});

	// The multiline branch only writes/executes a temp .sh file on Windows.
	const describeWindows = process.platform === 'win32' ? describe : describe.skip;

	describeWindows('Windows multiline branch (bash temp script)', () => {
		it('bash spawn does NOT set windowsHide:true or detached:true', async () => {
			const executePromise = executor.execute({ script: 'echo one\necho two' });
			mockChild.emit('close', 0);
			await executePromise;

			// Sanity check: this is the bash branch, not the shell branch.
			expect(vi.mocked(child_process.spawn).mock.calls[0]![0]).toBe('bash');

			const options = spawnOptions();
			expect(options['windowsHide']).not.toBe(true);
			expect(options['detached']).not.toBe(true);
		});
	});
});
