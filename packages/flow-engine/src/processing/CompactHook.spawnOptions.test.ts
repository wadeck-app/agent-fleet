/**
 * Characterization of CompactHook's process calls: the exact options of the command `spawn` and the
 * kill sequence on timeout (`taskkill` on Windows, process-group SIGKILL on POSIX).
 *
 * Pins today's behaviour so that routing these calls through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) is provably behavior-preserving. Unlike
 * ProcessTreeKiller, this class has its own kill: asynchronous `spawn('taskkill')` and `kill(-pid)`.
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCompactHook } from './CompactHook';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});

interface MockChild extends EventEmitter {
	pid: number | undefined;
	kill: ReturnType<typeof vi.fn>;
	stdin: { on: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
	stderr: EventEmitter;
}

function makeChild(pid: number | null = 9001): MockChild {
	const child = new EventEmitter() as MockChild;
	child.pid = pid ?? undefined;
	child.kill = vi.fn();
	child.stdin = { on: vi.fn(), end: vi.fn() };
	child.stderr = new EventEmitter();
	return child;
}

function run(timeoutMs: number, onWarning: (message: string) => void = () => {}): Promise<void> {
	return runCompactHook({
		command: 'my-hook --flag',
		timeoutMs,
		cwd: '/work',
		env: { BASE: '1' },
		event: { event: 'success', trigger: 'auto', preTokens: 10, postTokens: 5 },
		context: { stepId: 'step-1', taskId: 'task-1' },
		onWarning,
	});
}

describe('CompactHook -- process call contract', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('spawns the command string with exactly cwd, env, shell:true, stdio [pipe, ignore, pipe] and detached', async () => {
		const child = makeChild();
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);

		const done = run(1000);
		child.emit('close', 0);
		await done;

		expect(child_process.spawn).toHaveBeenCalledOnce();
		const [command, options] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [
			string,
			Record<string, unknown>,
		];
		expect(command).toBe('my-hook --flag');
		expect(Object.keys(options).sort()).toEqual(['cwd', 'detached', 'env', 'shell', 'stdio']);
		expect(options['cwd']).toBe('/work');
		expect(options['shell']).toBe(true);
		expect(options['stdio']).toEqual(['pipe', 'ignore', 'pipe']);
		// Own process group on POSIX only; DETACHED_PROCESS would strip the Windows console handle.
		expect(options['detached']).toBe(process.platform !== 'win32');
		expect(options['env']).toMatchObject({
			BASE: '1',
			FLOW_COMPACT_EVENT: 'success',
			FLOW_COMPACT_TRIGGER: 'auto',
		});
		expect(child.stdin.end).toHaveBeenCalledOnce();
	});

	it('detached is false on Windows and true elsewhere', async () => {
		for (const [platform, expected] of [
			['win32', false],
			['linux', true],
		] as const) {
			vi.mocked(child_process.spawn).mockClear();
			vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
			const child = makeChild();
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);

			const done = run(1000);
			child.emit('close', 0);
			await done;

			const options = vi.mocked(child_process.spawn).mock.calls[0]![1] as unknown as Record<string, unknown>;
			expect(options['detached']).toBe(expected);
		}
	});

	describe('timeout kill', () => {
		it('on Windows spawns `taskkill /PID <pid> /T /F` (stdio ignore, windowsHide) and resolves when it closes', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			const child = makeChild(9001);
			const killer = new EventEmitter();
			vi.mocked(child_process.spawn)
				.mockReturnValueOnce(child as unknown as child_process.ChildProcess)
				.mockReturnValueOnce(killer as unknown as child_process.ChildProcess);
			const warnings: string[] = [];

			let resolved = false;
			const done = run(1000, message => warnings.push(message)).then(() => (resolved = true));
			await vi.advanceTimersByTimeAsync(1000);

			expect(warnings).toEqual(["onCompact command for step 'step-1' timed out after 1s and was killed."]);
			expect(child_process.spawn).toHaveBeenCalledTimes(2);
			expect(vi.mocked(child_process.spawn).mock.calls[1]).toEqual([
				'taskkill',
				['/PID', '9001', '/T', '/F'],
				{ stdio: 'ignore', windowsHide: true },
			]);
			// Still waiting for taskkill itself.
			expect(resolved).toBe(false);
			killer.emit('close', 0);
			await done;
			expect(resolved).toBe(true);
		});

		it('on Windows, a taskkill that cannot be started does not block the hook', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			const killer = new EventEmitter();
			vi.mocked(child_process.spawn)
				.mockReturnValueOnce(makeChild() as unknown as child_process.ChildProcess)
				.mockReturnValueOnce(killer as unknown as child_process.ChildProcess);

			const done = run(1000);
			await vi.advanceTimersByTimeAsync(1000);
			killer.emit('error', new Error('ENOENT'));

			await expect(done).resolves.toBeUndefined();
		});

		it('on POSIX sends SIGKILL to the whole process group (-pid)', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			const child = makeChild(9001);
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
			const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

			const done = run(1000);
			await vi.advanceTimersByTimeAsync(1000);
			await done;

			expect(processKill).toHaveBeenCalledOnce();
			expect(processKill).toHaveBeenCalledWith(-9001, 'SIGKILL');
			expect(child.kill).not.toHaveBeenCalled();
			expect(child_process.spawn).toHaveBeenCalledOnce();
		});

		it('on POSIX falls back to child.kill(SIGKILL) when the group kill throws', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			const child = makeChild(9001);
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
			vi.spyOn(process, 'kill').mockImplementation(() => {
				throw new Error('ESRCH');
			});

			const done = run(1000);
			await vi.advanceTimersByTimeAsync(1000);
			await done;

			expect(child.kill).toHaveBeenCalledWith('SIGKILL');
		});

		it('kills nothing when the process has no pid (it never started)', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			const child = makeChild(null);
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
			const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

			const done = run(1000);
			await vi.advanceTimersByTimeAsync(1000);
			await done;

			expect(processKill).not.toHaveBeenCalled();
			expect(child.kill).not.toHaveBeenCalled();
		});

		it('does not kill a command that ended before the timeout', async () => {
			const child = makeChild();
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
			const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

			const done = run(1000);
			child.emit('close', 0);
			await done;
			await vi.advanceTimersByTimeAsync(5000);

			expect(processKill).not.toHaveBeenCalled();
			expect(child_process.spawn).toHaveBeenCalledOnce();
		});
	});
});
