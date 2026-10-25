/**
 * Kills a process together with everything it started.
 *
 * `ChildProcess.kill()` ends only that one process: a grandchild (a background task, a browser, a dev
 * server started by a tool call) keeps running and keeps the stdio pipes open, so the launcher would
 * still never see `close`.
 *
 * - Windows: `taskkill /T /F` (the process is not spawned detached, see ClaudeLauncher.windows-console.test.ts).
 * - POSIX: descendants are enumerated with `pgrep -P` and signalled (SIGKILL by default), deepest first,
 *   then the process itself. Only verified on Windows.
 *
 * A pid that no longer exists is not an error: the tree may have ended by itself between the decision
 * to kill and the kill. A kill tool that cannot even be started is, and is reported with what to do.
 */
import { spawnSync } from 'node:child_process';

export type TreeKillSignal = 'SIGTERM' | 'SIGKILL';

/**
 * Pids of everything below `pid` (deepest first), taken while `pid` is alive. Once it has exited its
 * children are re-parented and can no longer be found, so a caller that wants a SIGTERM -> SIGKILL
 * escalation takes this snapshot first. Always empty on Windows, where `taskkill /T` walks the tree itself.
 */
export function snapshotDescendants(pid: number): number[] {
	return process.platform === 'win32' ? [] : descendantsDeepestFirst(pid);
}

/** Signals each pid, ignoring those that are already gone. */
export function signalProcesses(pids: readonly number[], signal: TreeKillSignal): void {
	for (const pid of pids) {
		killQuietly(pid, signal);
	}
}

/**
 * `signal` is honoured on POSIX only: Windows has no graceful signal for a console tree, so `taskkill /F`
 * always ends it at once.
 */
export function killProcessTree(pid: number, signal: TreeKillSignal = 'SIGKILL'): void {
	if (process.platform === 'win32') {
		const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
			encoding: 'utf8',
			windowsHide: true,
		});
		if (result.error) {
			throw new Error(
				`Could not run taskkill to end process ${String(pid)} and its children: ${result.error.message}. Check that %SystemRoot%\\System32 is on PATH.`
			);
		}
		return;
	}
	for (const descendant of descendantsDeepestFirst(pid)) {
		killQuietly(descendant, signal);
	}
	killQuietly(pid, signal);
}

function descendantsDeepestFirst(pid: number): number[] {
	// pgrep exits 1 when there is no match, which is the normal "no children" answer.
	const result = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
	if (result.error) {
		throw new Error(
			`Could not run pgrep to find the children of process ${String(pid)}: ${result.error.message}. Install procps (pgrep) so a model process tree can be ended cleanly.`
		);
	}
	const children = result.stdout
		.split('\n')
		.map(line => Number(line.trim()))
		.filter(value => Number.isInteger(value) && value > 0);
	return [...children.flatMap(descendantsDeepestFirst), ...children];
}

function killQuietly(pid: number, signal: TreeKillSignal): void {
	try {
		process.kill(pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
			throw error;
		}
	}
}
