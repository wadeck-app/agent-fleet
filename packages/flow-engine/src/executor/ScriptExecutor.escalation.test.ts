/**
 * Timeout escalation with spawn mocked: SIGTERM, then after the grace period SIGKILL.
 * The mock behaves like a real ChildProcess: `killed` turns true as soon as kill() was called, whatever
 * the process did with the signal (so it must not be used to decide whether the force kill is needed).
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { killProcessTree, snapshotDescendants } from '../processing/ProcessTreeKiller';
import { ScriptExecutor } from './ScriptExecutor';

vi.mock('child_process');
vi.mock('../processing/ProcessTreeKiller');

interface MockChild extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
	pid?: number;
	exitCode: number | null;
}

function makeChild(pid: number | undefined): MockChild {
	const child = new EventEmitter() as MockChild;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.pid = pid;
	child.exitCode = null;
	child.killed = false;
	child.kill = vi.fn(() => {
		child.killed = true;
		return true;
	});
	return child;
}

describe('ScriptExecutor -- timeout escalation', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(snapshotDescendants).mockReturnValue([]);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.resetAllMocks();
	});

	it('sends SIGKILL after the grace period even though kill() already flagged the child as killed', async () => {
		const child = makeChild(undefined);
		vi.spyOn(child_process, 'spawn').mockReturnValue(child as never);

		const promise = new ScriptExecutor().execute({ script: 'sleep 99', timeout: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
		expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');

		await vi.advanceTimersByTimeAsync(5000);
		expect(child.kill).toHaveBeenCalledWith('SIGKILL');

		child.emit('close', null);
		const result = await promise;
		expect(result.timedOut).toBe(true);
	});

	it('does not force kill when the process ended during the grace period', async () => {
		const child = makeChild(undefined);
		vi.spyOn(child_process, 'spawn').mockReturnValue(child as never);

		const promise = new ScriptExecutor().execute({ script: 'sleep 99', timeout: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		child.emit('close', null);
		await promise;
		await vi.advanceTimersByTimeAsync(10000);

		expect(child.kill).not.toHaveBeenCalledWith('SIGKILL');
	});

	it('terminates the whole tree (SIGTERM, then SIGKILL) when the child has a pid', async () => {
		const child = makeChild(4242);
		vi.spyOn(child_process, 'spawn').mockReturnValue(child as never);

		const promise = new ScriptExecutor().execute({ script: 'sleep 99', timeout: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(killProcessTree).toHaveBeenCalledWith(4242, 'SIGTERM');

		await vi.advanceTimersByTimeAsync(5000);
		expect(killProcessTree).toHaveBeenCalledWith(4242, 'SIGKILL');

		child.emit('close', null);
		await promise;
	});
});
