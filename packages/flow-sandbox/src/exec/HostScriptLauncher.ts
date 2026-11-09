import type { ProcessLauncher, ProcessSignal } from 'flow-engine';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import type { SandboxLog } from '../SandboxLog';
import type { HostScriptEnvironment } from './HostScriptEnvironment';

export interface HostScriptLauncherOptions {
	/** The real launcher of the machine (flow-engine's DefaultProcessLauncher): spawning, killing a tree, lookups. */
	inner: ProcessLauncher;
	environment: HostScriptEnvironment;
	/** Environment names the step declares (its `env` and `secrets`): the only ones, besides the baseline, a process receives. */
	declaredEnvironmentNames: ReadonlySet<string>;
	log: SandboxLog;
}

/**
 * `ProcessLauncher` of a script step that runs on the wrapper's machine (`host: true`). It IS the machine's launcher
 * (same spawn, same kill-tree and timeout behaviour, same output capture in the engine), with one difference: the
 * environment of every process it starts goes through {@link HostScriptEnvironment}, an allow-list, because the engine
 * hands a script the whole environment of the wrapper process (launch token, AWS profile, real home directories).
 *
 * It does not declare `isolatesEnvironment`: that flag means "runs somewhere else" to the engine and changes how shells
 * are found (in the VM); here the shell is the machine's own, found as for any local worker.
 */
export class HostScriptLauncher implements ProcessLauncher {
	public readonly isolatesEnvironment = false;

	constructor(private readonly options: HostScriptLauncherOptions) {}

	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the options come from the engine unchanged apart from the environment
	public spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the options come from the engine unchanged apart from the environment
	public spawn(command: string, options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only, the options come from the engine unchanged apart from the environment
	public spawn(
		command: string,
		argsOrOptions: readonly string[] | SpawnOptions,
		options?: SpawnOptions
	): ChildProcess {
		if (options === undefined) {
			return this.options.inner.spawn(command, this.restricted(argsOrOptions as SpawnOptions));
		}
		return this.options.inner.spawn(command, argsOrOptions as string[], this.restricted(options));
	}

	public killTree(pid: number, signal: ProcessSignal): void {
		this.options.inner.killTree(pid, signal);
	}

	public snapshotDescendants(pid: number): number[] {
		return this.options.inner.snapshotDescendants(pid);
	}

	public signalProcesses(pids: readonly number[], signal: ProcessSignal): void {
		this.options.inner.signalProcesses(pids, signal);
	}

	public lookupExecutable(command: string): string {
		return this.options.inner.lookupExecutable(command);
	}

	public killTreeAndWait(child: ChildProcess): Promise<void> {
		return this.options.inner.killTreeAndWait(child);
	}

	/** The options with the environment filtered. A process started without an `env` inherits the wrapper's, so it gets the filtered process environment. */
	private restricted(options: SpawnOptions): SpawnOptions {
		const { environment, declaredEnvironmentNames, log } = this.options;
		const filtered = environment.filter(options.env ?? process.env, declaredEnvironmentNames);
		const line = environment.describe(filtered);
		if (line !== undefined) log.info(`host script: ${line}`);
		return { ...options, env: filtered.env };
	}
}
