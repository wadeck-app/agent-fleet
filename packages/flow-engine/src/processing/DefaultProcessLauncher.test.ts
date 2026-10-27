import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultProcessLauncher } from './DefaultProcessLauncher';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});

describe('DefaultProcessLauncher', () => {
	const launcher = new DefaultProcessLauncher();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('spawn with an argument list forwards command, the same args array and the same options object', () => {
		const child = {} as child_process.ChildProcess;
		vi.mocked(child_process.spawn).mockReturnValue(child);
		const args = ['-c', 'x'];
		const options = { cwd: '/w', stdio: 'pipe' as const };

		expect(launcher.spawn('sh', args, options)).toBe(child);

		const call = vi.mocked(child_process.spawn).mock.calls[0] as unknown[];
		expect(call).toHaveLength(3);
		expect(call[1]).toBe(args);
		expect(call[2]).toBe(options);
	});

	it('spawn without an argument list calls child_process.spawn with exactly two arguments', () => {
		vi.mocked(child_process.spawn).mockReturnValue({} as child_process.ChildProcess);
		const options = { shell: true };

		launcher.spawn('echo hi', options);

		const call = vi.mocked(child_process.spawn).mock.calls[0] as unknown[];
		expect(call).toHaveLength(2);
		expect(call[1]).toBe(options);
	});

	it('lookupExecutable runs the command line with utf8 + windowsHide and returns trimmed stdout', () => {
		vi.mocked(child_process.execSync).mockReturnValue('  /usr/bin/claude\n' as unknown as Buffer);

		expect(launcher.lookupExecutable('which claude')).toBe('/usr/bin/claude');
		expect(child_process.execSync).toHaveBeenCalledWith('which claude', { encoding: 'utf8', windowsHide: true });
	});

	it('lookupExecutable lets the lookup error through', () => {
		vi.mocked(child_process.execSync).mockImplementation(() => {
			throw new Error('not found');
		});

		expect(() => launcher.lookupExecutable('which nope')).toThrow('not found');
	});

	it('killTree on Windows runs taskkill /T /F synchronously', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
		vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof child_process.spawnSync>);

		launcher.killTree(42, 'SIGTERM');

		expect(child_process.spawnSync).toHaveBeenCalledWith('taskkill', ['/PID', '42', '/T', '/F'], {
			encoding: 'utf8',
			windowsHide: true,
		});
	});

	it('killTree on POSIX signals the pid after its descendants; snapshotDescendants and signalProcesses use the same primitives', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stdout: '' } as ReturnType<
			typeof child_process.spawnSync
		>);
		const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);

		launcher.killTree(42, 'SIGKILL');
		launcher.signalProcesses([7, 8], 'SIGTERM');

		expect(kill.mock.calls).toEqual([
			[42, 'SIGKILL'],
			[7, 'SIGTERM'],
			[8, 'SIGTERM'],
		]);
		expect(launcher.snapshotDescendants(42)).toEqual([]);
		expect(child_process.spawnSync).toHaveBeenCalledWith('pgrep', ['-P', '42'], { encoding: 'utf8' });
	});

	it('killTreeAndWait resolves at once when the child has no pid', async () => {
		await launcher.killTreeAndWait({ pid: undefined } as child_process.ChildProcess);

		expect(child_process.spawn).not.toHaveBeenCalled();
	});

	it('killTreeAndWait on Windows spawns taskkill and resolves when it closes', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
		const killer = new EventEmitter();
		vi.mocked(child_process.spawn).mockReturnValue(killer as unknown as child_process.ChildProcess);

		const done = launcher.killTreeAndWait({ pid: 9 } as child_process.ChildProcess);
		killer.emit('close', 0);
		await done;

		expect(child_process.spawn).toHaveBeenCalledWith('taskkill', ['/PID', '9', '/T', '/F'], {
			stdio: 'ignore',
			windowsHide: true,
		});
	});

	it('killTreeAndWait on POSIX kills the process group and falls back to child.kill', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		const kill = vi.spyOn(process, 'kill').mockImplementationOnce(() => {
			throw new Error('ESRCH');
		});
		const childKill = vi.fn();

		await launcher.killTreeAndWait({ pid: 9, kill: childKill } as unknown as child_process.ChildProcess);

		expect(kill).toHaveBeenCalledWith(-9, 'SIGKILL');
		expect(childKill).toHaveBeenCalledWith('SIGKILL');
	});
});
