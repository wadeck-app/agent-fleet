/**
 * In-memory {@link ProcessLauncher} for tests: records every call and never touches the operating system.
 *
 * A test that injects it proves a class goes through the seam: any direct `node:child_process` use would
 * not show up in `calls`. `spawn` returns the next queued child, and fails loudly when none is queued
 * (no silent default child). Lookups answer from `lookups` and throw "not found" otherwise.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';

import type { ProcessLauncher, ProcessSignal } from '../processing/ProcessLauncher';

export type LauncherCall =
	| { method: 'spawn'; command: string; args: readonly string[] | undefined; options: SpawnOptions }
	| { method: 'killTree'; pid: number; signal: ProcessSignal }
	| { method: 'snapshotDescendants'; pid: number }
	| { method: 'signalProcesses'; pids: readonly number[]; signal: ProcessSignal }
	| { method: 'lookupExecutable'; command: string }
	| { method: 'killTreeAndWait'; child: ChildProcess };

/** Minimal child usable as a spawn result: emits events, has pipes and a no-op `kill`. */
export function createFakeChild(pid: number | undefined = 1000): ChildProcess {
	// violations-suppress: ts/no-unsafe-type-cast test double: a partial ChildProcess built field by field
	const child = new EventEmitter() as unknown as Record<string, unknown>;
	child['pid'] = pid;
	child['exitCode'] = null;
	child['signalCode'] = null;
	child['kill'] = () => true;
	child['stdout'] = Object.assign(new EventEmitter(), { destroy: () => undefined });
	child['stderr'] = Object.assign(new EventEmitter(), { destroy: () => undefined });
	child['stdin'] = Object.assign(new EventEmitter(), { end: () => undefined, write: () => true });
	return child as unknown as ChildProcess;
}

export class FakeProcessLauncher implements ProcessLauncher {
	public readonly calls: LauncherCall[] = [];
	/** Answers of `lookupExecutable`, keyed by the exact command line. */
	public readonly lookups = new Map<string, string>();
	private readonly queuedChildren: ChildProcess[] = [];

	public queueChild(child: ChildProcess): void {
		this.queuedChildren.push(child);
	}

	public callsOf<M extends LauncherCall['method']>(method: M): Extract<LauncherCall, { method: M }>[] {
		return this.calls.filter((call): call is Extract<LauncherCall, { method: M }> => call.method === method);
	}

	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the caller decides the options (windowsHide must not be forced, see d032e7e)
	public spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the caller decides the options (windowsHide must not be forced, see d032e7e)
	public spawn(command: string, options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the caller decides the options (windowsHide must not be forced, see d032e7e)
	public spawn(
		command: string,
		argsOrOptions: readonly string[] | SpawnOptions,
		options?: SpawnOptions
	): ChildProcess {
		this.calls.push(
			options === undefined
				? { method: 'spawn', command, args: undefined, options: argsOrOptions as SpawnOptions }
				: { method: 'spawn', command, args: argsOrOptions as readonly string[], options }
		);
		const child = this.queuedChildren.shift();
		if (child === undefined) {
			throw new Error(
				// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the caller decides the options (windowsHide must not be forced, see d032e7e)
				`FakeProcessLauncher.spawn('${command}') has no queued child: call queueChild() before the code under test spawns.`
			);
		}
		return child;
	}

	public killTree(pid: number, signal: ProcessSignal): void {
		this.calls.push({ method: 'killTree', pid, signal });
	}

	public snapshotDescendants(pid: number): number[] {
		this.calls.push({ method: 'snapshotDescendants', pid });
		return [];
	}

	public signalProcesses(pids: readonly number[], signal: ProcessSignal): void {
		this.calls.push({ method: 'signalProcesses', pids, signal });
	}

	public lookupExecutable(command: string): string {
		this.calls.push({ method: 'lookupExecutable', command });
		const answer = this.lookups.get(command);
		if (answer === undefined) {
			throw new Error(`FakeProcessLauncher: '${command}' not found (no entry in lookups).`);
		}
		return answer;
	}

	public killTreeAndWait(child: ChildProcess): Promise<void> {
		this.calls.push({ method: 'killTreeAndWait', child });
		return Promise.resolve();
	}
}
