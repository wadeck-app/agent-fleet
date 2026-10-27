/**
 * The seam between the engine and the operating system for every process a step starts or ends.
 *
 * Why: model CLIs and scripts are spawned, tree-killed and looked up with `node:child_process` in
 * several classes. Routing them through one interface lets a different launcher (for example one that
 * runs them inside a sandbox) replace the host implementation without touching those classes.
 * Plan: .claude/plans/2026-10-25_docker-sandbox-worker.md, C4.
 *
 * The launcher does not decide options. Each caller keeps passing its own stdio, env, cwd, shell and
 * `windowsHide` choice (several callers must NOT set `windowsHide`, see d032e7e), so the default
 * implementation is a verbatim move of the calls that existed before the seam.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type ProcessSignal = 'SIGTERM' | 'SIGKILL';

export interface ProcessLauncher {
	/**
	 * `child_process.spawn`. Both forms exist because callers use both: with `shell: true` and a whole
	 * command line the argument list is omitted.
	 */
	spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
	spawn(command: string, options: SpawnOptions): ChildProcess;

	/** Synchronously ends `pid` and everything it started (`ProcessTreeKiller.killProcessTree`). Throws an actionable Error. */
	killTree(pid: number, signal: ProcessSignal): void;

	/** Descendants of `pid` while it is alive, for a SIGTERM then SIGKILL escalation (`snapshotDescendants`). */
	snapshotDescendants(pid: number): number[];

	/** Signals each pid, ignoring those already gone (`signalProcesses`). */
	signalProcesses(pids: readonly number[], signal: ProcessSignal): void;

	/**
	 * Runs an executable lookup command line (`where claude`, `which codex`, ...) and returns its trimmed
	 * stdout. Throws when the command fails, which callers read as "not found".
	 */
	lookupExecutable(command: string): string;

	/**
	 * Ends the tree of a shell child that was spawned for a hook command (own process group on POSIX) and
	 * resolves once done. Never rejects. Separate from `killTree` on purpose: asynchronous on Windows and a
	 * process-group kill on POSIX, so the two have different semantics.
	 */
	killTreeAndWait(child: ChildProcess): Promise<void>;
}
