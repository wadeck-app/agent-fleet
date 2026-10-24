import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

/** Spawn option that makes {@link killProcessTree} reach grandchildren on POSIX (a process group of its own). */
export const OWN_PROCESS_GROUP = process.platform !== 'win32';

function hasExited(child: ChildProcess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Kills `child` AND everything it started, then waits until it is gone.
 *
 * On Windows `child.kill()` terminates only that one process: a grandchild (worker, updater) keeps running and its
 * working directory stays locked, so removing the test's temp dir fails with EPERM. The tree is killed with
 * `taskkill /T`; on POSIX the child must have been spawned with `detached: OWN_PROCESS_GROUP` so its group can be
 * signalled. Throws, naming the pid, if the process is still alive after `timeoutMs`.
 */
export async function killProcessTree(child: ChildProcess, timeoutMs = 10_000): Promise<void> {
	if (hasExited(child)) {
		return;
	}
	const pid = child.pid;
	if (pid === undefined) {
		throw new Error('killProcessTree: the child has no pid (it never started).');
	}
	// The tool may exit non-zero because a member of the tree ended by itself between its enumeration and its kill
	// ("no running instance of this task", seen with a daemon whose short-lived child had just exited). That is not a
	// failure: what matters is that the child is gone, checked below; the report is kept for the error message.
	let killReport = '';
	if (process.platform === 'win32') {
		const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
			encoding: 'utf8',
			windowsHide: true,
		});
		killReport = `taskkill status ${String(result.status)}: ${result.stdout}${result.stderr}`;
	} else {
		process.kill(-pid, 'SIGKILL');
	}
	if (hasExited(child)) {
		return;
	}
	const cancelTimeout = new AbortController();
	const exited = await Promise.race([
		once(child, 'exit').then(() => true),
		delay(timeoutMs, false, { signal: cancelTimeout.signal }),
	]);
	cancelTimeout.abort();
	if (!exited) {
		throw new Error(
			`killProcessTree: pid ${String(pid)} was still alive ${String(timeoutMs)}ms after being killed. ${killReport}`
		);
	}
}
