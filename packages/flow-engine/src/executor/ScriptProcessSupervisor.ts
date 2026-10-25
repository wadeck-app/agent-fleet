/**
 * Supervises one spawned script process until it is over.
 *
 * What a plain `child.on('close')` gets wrong for a script that starts other programs (a test server, a
 * browser, a background job):
 * - a timeout only ended the shell, not what it started, and the force kill was guarded by
 *   `child.killed`, which is true after the first `kill()` whatever the process did with the signal;
 * - a grandchild that inherited stdout/stderr keeps the pipes open after the script has ended, so
 *   `close` (which waits for the pipes) never came until the daemon's silence watchdog gave up.
 *
 * So here: the whole tree is ended (SIGTERM, grace, SIGKILL; Windows has no graceful step and is always
 * forceful), and the outcome is settled shortly after the process `exit`s even when the pipes stay open.
 *
 * Not done, on purpose: a grandchild still running after the script ended on its own is left running
 * (a script may start a daemon deliberately); it is only reported, when it held the pipes.
 */
import type { ChildProcess } from 'node:child_process';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { killProcessTree, signalProcesses, snapshotDescendants } from '../processing/ProcessTreeKiller';

/** Time a terminated process gets between SIGTERM and SIGKILL. */
export const TERMINATION_GRACE_MS = 5000;
/** Time the pipes get to drain after the process exited before they are cut. */
export const PIPE_DRAIN_GRACE_MS = 2000;

export interface ScriptProcessOutcome {
	/** Exit code, or null when the process was ended by a signal. */
	code: number | null;
	/** True when the timeout elapsed and the tree was killed. */
	timedOut: boolean;
}

export interface ScriptProcessSupervisorOptions {
	/** Wall-clock limit in milliseconds. Absent or 0 = none. */
	timeoutMs?: number;
	/** Told about the notable things the supervisor did, to put in the step's output. */
	onNotice: (message: string) => void;
	terminationGraceMs?: number;
	pipeDrainGraceMs?: number;
}

/** What `killAllRunningScripts` needs to reach a script that is still running. */
interface RunningScript {
	killNow(): void;
}

const running = new Set<RunningScript>();

/**
 * Ends every script process tree still running, immediately and synchronously (usable from a
 * `process.on('exit')` handler). Problems are written to stderr and do not stop the others.
 */
export function killAllRunningScripts(): void {
	for (const script of [...running]) {
		try {
			script.killNow();
		} catch (error) {
			process.stderr.write(
				`[ScriptExecutor] Could not end a running script on shutdown: ${getErrorMessage(error)}\n`
			);
		}
	}
}

export function superviseScriptProcess(
	child: ChildProcess,
	options: ScriptProcessSupervisorOptions
): Promise<ScriptProcessOutcome> {
	const terminationGraceMs = options.terminationGraceMs ?? TERMINATION_GRACE_MS;
	const pipeDrainGraceMs = options.pipeDrainGraceMs ?? PIPE_DRAIN_GRACE_MS;

	return new Promise<ScriptProcessOutcome>((resolve, reject) => {
		let settled = false;
		let exited = false;
		let timedOut = false;
		let timeoutTimer: NodeJS.Timeout | undefined;
		let escalationTimer: NodeJS.Timeout | undefined;
		let drainTimer: NodeJS.Timeout | undefined;
		// Descendants known before SIGTERM: after the root exits they can no longer be found.
		let descendants: number[] = [];

		const script: RunningScript = { killNow: () => signalTree('SIGKILL') };
		running.add(script);

		function signalTree(signal: 'SIGTERM' | 'SIGKILL'): void {
			if (child.pid === undefined) {
				child.kill(signal);
				return;
			}
			killProcessTree(child.pid, signal);
		}

		function settle(outcome: ScriptProcessOutcome | Error): void {
			if (settled) {
				return;
			}
			settled = true;
			running.delete(script);
			clearTimeout(timeoutTimer);
			clearTimeout(drainTimer);
			// Survivors of the SIGTERM may still have to be force killed after the root is gone.
			if (descendants.length === 0) {
				clearTimeout(escalationTimer);
			}
			if (outcome instanceof Error) {
				reject(outcome);
			} else {
				resolve(outcome);
			}
		}

		function fail(error: unknown): void {
			settle(error instanceof Error ? error : new Error(String(error)));
		}

		function escalate(): void {
			try {
				if (!exited) {
					signalTree('SIGKILL');
				}
				signalProcesses(descendants, 'SIGKILL');
			} catch (error) {
				// A timer callback must not throw: that would take the worker down with it.
				fail(error);
			}
		}

		function onTimeout(): void {
			timedOut = true;
			options.onNotice(
				`Script timed out after ${String((options.timeoutMs ?? 0) / 1000)}s: ending the process and every process it started`
			);
			try {
				if (child.pid !== undefined) {
					descendants = snapshotDescendants(child.pid);
				}
				signalTree('SIGTERM');
			} catch (error) {
				fail(error);
				return;
			}
			escalationTimer = setTimeout(escalate, terminationGraceMs);
		}

		if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
			timeoutTimer = setTimeout(onTimeout, options.timeoutMs);
		}

		child.on('exit', () => {
			exited = true;
			// `close` waits for the pipes, which a surviving grandchild can hold open for as long as it lives.
			drainTimer = setTimeout(() => {
				if (settled) {
					return;
				}
				options.onNotice(
					`The script ended but a process it started still holds its output open; not waiting for it (it was left running unless the step timed out). Output printed after this point is not captured`
				);
				child.stdout?.destroy();
				child.stderr?.destroy();
				settle({ code: child.exitCode, timedOut });
			}, pipeDrainGraceMs);
		});

		child.on('close', code => {
			exited = true;
			settle({ code, timedOut });
		});

		child.on('error', error => {
			exited = true;
			settle(error);
		});
	});
}
