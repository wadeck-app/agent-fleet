/**
 * Host implementation of {@link ProcessLauncher}: forwards every call unchanged to `node:child_process`
 * and `ProcessTreeKiller`. It adds no option, default or error handling of its own.
 */
import { type ChildProcess, type SpawnOptions, execSync, spawn } from 'node:child_process';

import type { ProcessLauncher, ProcessSignal } from './ProcessLauncher';
import { killProcessTree, signalProcesses, snapshotDescendants } from './ProcessTreeKiller';

export class DefaultProcessLauncher implements ProcessLauncher {
	public spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
	public spawn(command: string, options: SpawnOptions): ChildProcess;
	public spawn(
		command: string,
		argsOrOptions: readonly string[] | SpawnOptions,
		options?: SpawnOptions
	): ChildProcess {
		if (options === undefined) {
			// violations-suppress: cli/no-spawn-without-windows-hide the caller decides: windowsHide strips the console handle, so grandchildren allocate a visible console -- see d032e7e
			return spawn(command, argsOrOptions as SpawnOptions);
		}
		// violations-suppress: cli/no-spawn-without-windows-hide the caller decides: windowsHide strips the console handle, so grandchildren allocate a visible console -- see d032e7e
		return spawn(command, argsOrOptions as string[], options);
	}

	public killTree(pid: number, signal: ProcessSignal): void {
		killProcessTree(pid, signal);
	}

	public snapshotDescendants(pid: number): number[] {
		return snapshotDescendants(pid);
	}

	public signalProcesses(pids: readonly number[], signal: ProcessSignal): void {
		signalProcesses(pids, signal);
	}

	public lookupExecutable(command: string): string {
		return execSync(command, { encoding: 'utf8', windowsHide: true }).trim();
	}

	/**
	 * Kills the shell and everything it started: with `shell: true`, killing only the shell leaves the
	 * user's command running (on Windows, `cmd.exe` dies and its child keeps going).
	 */
	public killTreeAndWait(child: ChildProcess): Promise<void> {
		const pid = child.pid;
		if (pid === undefined) return Promise.resolve();
		if (process.platform === 'win32') {
			return new Promise(resolve => {
				const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
					stdio: 'ignore',
					windowsHide: true,
				});
				killer.on('error', () => resolve());
				killer.on('close', () => resolve());
			});
		}
		try {
			process.kill(-pid, 'SIGKILL');
		} catch {
			child.kill('SIGKILL');
		}
		return Promise.resolve();
	}
}
