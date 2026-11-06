import type { ProcessLauncher, ProcessSignal } from 'flow-engine';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import type { SandboxRuntime } from '../SandboxRuntime';
import type { McpCallbackRules } from './McpCallbackRules';
import {
	FIRST_SYNTHETIC_PID,
	type OutputMode,
	SandboxChildProcess,
	type StandardInputMode,
	asChildProcess,
} from './SandboxChildProcess';
import type { StepCommandTranslator } from './StepCommandTranslator';
import type { VmExecutableLookup } from './VmExecutableLookup';

export interface SbxProcessLauncherOptions {
	runtime: SandboxRuntime;
	/** The run's sandbox. One launcher serves one sandbox. */
	sandbox: string;
	translator: StepCommandTranslator;
	lookup: VmExecutableLookup;
	mcpRules: McpCallbackRules;
	log: SandboxLog;
	/**
	 * Stops the sandbox so every process in it dies (the lifecycle's `stopForKill`): a host-side abort of
	 * `sbx exec` does NOT end the process in the VM.
	 */
	stopSandbox: () => Promise<void>;
	/** Called before every process starts: restarts the sandbox if a kill stopped it (the lifecycle's `ensureRunning`), so the lifecycle never loses track of a running VM. */
	ensureRunning: () => Promise<void>;
	/** How long to wait for a caller that left stdin open before starting without input. Default 250 ms. */
	inputWaitMs?: number;
}

interface ActiveProcess {
	child: SandboxChildProcess;
	abort: AbortController;
	/** Set once the sandbox stop for this process was requested. */
	termination: Promise<void> | undefined;
	requestedSignal: ProcessSignal | undefined;
}

let nextSyntheticPid = FIRST_SYNTHETIC_PID;

/**
 * `ProcessLauncher` that runs every step process INSIDE the run's sandbox with `sbx exec` (exec variant). The engine
 * stays on the host; only the processes it would spawn move. All `sbx` calls go through SandboxRuntime.
 *
 * What maps, and what does not:
 * - spawn: command, arguments, cwd and env are translated by StepCommandTranslator (host-only variables dropped, temp
 *   files copied in, paths inside the two mounts translated, anything else refused). stdout/stderr stream as they
 *   arrive. The caller must write stdin and call `end()` right after `spawn` (the input is taken once, at start); an
 *   open stdin is not supported. `stdio: 'inherit'` (interactive) and `detached` are not supported ('inherit' throws,
 *   `detached` is ignored: there is no process group to create on the host).
 * - exit: `exit`/`close` carry the numeric exit code of the program in the VM. A signal death inside the VM shows as
 *   128+n (sbx reports no signal), so `signalCode` is only ever set for a process this launcher ended itself.
 * - pid: synthetic (from {@link FIRST_SYNTHETIC_PID}), never a host pid; it only means something to this launcher.
 * - kill / killTree / killTreeAndWait: the process cannot be reached from the host, so the SANDBOX is stopped (about
 *   0.6 s; every process in the VM dies, SIGTERM is as hard as SIGKILL, no grace period for traps) and the host `exec`
 *   is aborted. One step runs at a time per sandbox, so no sibling step is hit; the next process restarts the VM through the lifecycle (`ensureRunning`).
 *   `killTree` is asynchronous in effect (it returns before the stop finished); the exit-time kill of the engine
 *   (`killAllRunningScripts` at process exit) therefore cannot wait for it: the wrapper's own shutdown stops the
 *   sandbox, and a hard crash leaves the VM to sbx's idle stop.
 * - snapshotDescendants: `[]`. The descendants live in the VM and die with the stop; there is no host pid to track.
 *   signalProcesses: a no-op for `[]`, an error for anything else (nothing in the VM can be signalled by host pid).
 * - lookupExecutable: answered from the table primed in the VM (VmExecutableLookup).
 */
export class SbxProcessLauncher implements ProcessLauncher {
	private readonly active = new Map<number, ActiveProcess>();
	private readonly running = new Set<Promise<void>>();
	private readonly inputWaitMs: number;

	constructor(private readonly options: SbxProcessLauncherOptions) {
		this.inputWaitMs = options.inputWaitMs ?? 250;
	}

	// violations-suppress: cli/no-spawn-without-windows-hide declaration only: this launcher starts no host process
	spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only: this launcher starts no host process
	spawn(command: string, options: SpawnOptions): ChildProcess;
	// violations-suppress: cli/no-spawn-without-windows-hide declaration only: this launcher starts no host process
	spawn(command: string, argsOrOptions: readonly string[] | SpawnOptions, maybeOptions?: SpawnOptions): ChildProcess {
		const commandLine = maybeOptions === undefined;
		const args = commandLine ? [] : (argsOrOptions as readonly string[]);
		const options = (commandLine ? argsOrOptions : maybeOptions) as SpawnOptions;
		const [stdin, stdout, stderr] = this.standardStreams(command, options);
		const abort = new AbortController();
		const pid = nextSyntheticPid++;
		const child = new SandboxChildProcess({
			pid,
			command,
			args,
			stdin,
			stdout,
			stderr,
			onKill: signal => {
				void this.terminate(pid, signal);
			},
		});
		this.active.set(pid, { child, abort, termination: undefined, requestedSignal: undefined });
		const run = this.run(pid, child, command, args, options).catch((error: unknown) => {
			this.options.log.warn(
				`process ${pid} (${command}) in "${this.options.sandbox}" ended with an unexpected launcher error: ${error instanceof Error ? error.message : String(error)}`
			);
		});
		this.running.add(run);
		void run.finally(() => this.running.delete(run));
		return asChildProcess(child);
	}

	killTree(pid: number, signal: ProcessSignal): void {
		void this.terminate(this.requireOwnPid(pid, 'killTree'), signal);
	}

	snapshotDescendants(pid: number): number[] {
		this.requireOwnPid(pid, 'snapshotDescendants');
		return [];
	}

	signalProcesses(pids: readonly number[], signal: ProcessSignal): void {
		if (pids.length === 0) return;
		throw new SandboxError(
			'invalid-argument',
			`signalProcesses(${pids.join(',')}, ${signal}) is not supported by the sandbox launcher: processes in the VM cannot be signalled by a host pid. Stop the sandbox instead (killTree).`
		);
	}

	lookupExecutable(command: string): string {
		return this.options.lookup.answer(this.options.sandbox, command);
	}

	async killTreeAndWait(child: ChildProcess): Promise<void> {
		const pid = child.pid;
		if (pid === undefined) return;
		const entry = this.active.get(pid);
		if (entry === undefined) return;
		try {
			await this.terminate(pid, 'SIGKILL');
		} catch (error) {
			// killTreeAndWait never rejects (CompactHook relies on it): the failure is already logged and in the stderr.
			this.options.log.warn(`killTreeAndWait: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** Resolves when every process started by this launcher is over (tests; the wrapper before it stops the sandbox). */
	async whenIdle(): Promise<void> {
		while (this.running.size > 0) await Promise.allSettled([...this.running]);
	}

	// ---- internals ----

	private async run(
		pid: number,
		child: SandboxChildProcess,
		command: string,
		args: readonly string[],
		options: SpawnOptions
	): Promise<void> {
		const entry = this.active.get(pid);
		if (entry === undefined) throw new Error(`SbxProcessLauncher: pid ${pid} is not registered`);
		const { sandbox, runtime, log } = this.options;
		const closers: Array<() => Promise<void>> = [];
		// Milliseconds spent before the program starts and in it, for the benchmark (logged once per process).
		const marks = { begin: performance.now(), translated: 0, ruled: 0, executed: 0 };
		let program = command;
		let outcome: { exit: { code: number | null; signal: NodeJS.Signals | null } } | { failure: Error };
		try {
			// A kill of an earlier process stopped the VM: the lifecycle restarts it (and its idle timer, capacity) first.
			await this.options.ensureRunning();
			// Let the caller attach its listeners and write its stdin before anything is started.
			const input = await child.takeInput(this.inputWaitMs);
			if (input === undefined && child.stdin !== null) {
				log.warn(
					`process "${command}" in "${sandbox}": its stdin was left open without input, so it starts with an empty input.`
				);
			}
			const translated = await this.options.translator.translate({
				sandbox,
				command,
				args,
				shell: options.shell,
				cwd: this.cwdOf(options),
				env: options.env as Record<string, string | undefined> | undefined,
			});
			program = translated.program;
			marks.translated = performance.now();
			if (entry.requestedSignal !== undefined) {
				outcome = { exit: { code: null, signal: entry.requestedSignal } };
			} else {
				// One rule per MCP callback port of this process, removed when it ends.
				for (const port of translated.mcpCallbackPorts) {
					closers.push(await this.options.mcpRules.open(sandbox, port));
				}
				marks.ruled = performance.now();
				const result = await runtime.exec({
					sandbox,
					command: translated.command,
					...(Object.keys(translated.env).length === 0 ? {} : { env: translated.env }),
					...(translated.cwd === undefined ? {} : { cwd: translated.cwd }),
					...(child.stdin === null ? {} : { stdin: input === undefined ? '' : input }),
					onStdout: text => child.pushStdout(text),
					onStderr: text => child.pushStderr(text),
					signal: entry.abort.signal,
				});
				marks.executed = performance.now();
				outcome = { exit: { code: result.exitCode, signal: null } };
			}
		} catch (error) {
			if (entry.requestedSignal !== undefined) {
				// We ended it: the abort error of the host side is the expected way out.
				await entry.termination?.catch(() => undefined);
				outcome = { exit: { code: null, signal: entry.requestedSignal } };
			} else {
				outcome = { failure: error instanceof Error ? error : new Error(String(error)) };
			}
		}
		// The rules go BEFORE the engine hears the process is over: "step ended" implies "its rule is gone".
		for (const close of closers) await close();
		this.active.delete(pid);
		if (marks.executed > 0) {
			log.info(
				`process timing ${JSON.stringify({
					pid,
					program,
					prepareMs: Math.round(marks.translated - marks.begin),
					ruleMs: Math.round(marks.ruled - marks.translated),
					execMs: Math.round(marks.executed - marks.ruled),
				})}`
			);
		}
		if ('failure' in outcome) await child.fail(outcome.failure);
		else await child.finish(outcome.exit);
	}

	/** Ends the process by stopping the sandbox, then aborts the host side. Idempotent per process. */
	private terminate(pid: number, signal: ProcessSignal): Promise<void> {
		const entry = this.active.get(pid);
		if (entry === undefined || entry.child.isFinished) return Promise.resolve();
		if (entry.termination !== undefined) return entry.termination;
		entry.requestedSignal = signal;
		entry.child.killed = true;
		const { sandbox, log } = this.options;
		log.info(
			`ending process ${pid} (${entry.child.spawnfile}) in "${sandbox}" with ${signal}: stopping the sandbox (a host-side abort does not end a process in the VM).`
		);
		entry.termination = this.options
			.stopSandbox()
			.catch((error: unknown) => {
				const reason = error instanceof Error ? error.message : String(error);
				log.warn(
					`could not stop sandbox "${sandbox}": ${reason}. The process may still run in the VM; stop it with: sbx stop ${sandbox}`
				);
				entry.child.pushStderr(
					`[flow] the sandbox could not be stopped (${reason}); the process may still run in the VM. Run: sbx stop ${sandbox}\n`
				);
			})
			.finally(() => entry.abort.abort());
		return entry.termination;
	}

	private requireOwnPid(pid: number, operation: string): number {
		if (pid >= FIRST_SYNTHETIC_PID) return pid;
		throw new SandboxError(
			'invalid-argument',
			`${operation}(${pid}): this pid is not a sandbox process of this launcher (sandbox pids start at ${FIRST_SYNTHETIC_PID}). The sandbox launcher never signals host processes.`
		);
	}

	private cwdOf(options: SpawnOptions): string | undefined {
		const { cwd } = options;
		if (cwd === undefined) return undefined;
		if (typeof cwd !== 'string') {
			throw new SandboxError(
				'invalid-argument',
				'A URL as the working directory of a sandbox process is not supported.'
			);
		}
		return cwd;
	}

	private standardStreams(command: string, options: SpawnOptions): [StandardInputMode, OutputMode, OutputMode] {
		const stdio = options.stdio ?? 'pipe';
		const entries = typeof stdio === 'string' ? [stdio, stdio, stdio] : [...stdio];
		const mode = (index: number): 'pipe' | 'ignore' => {
			const entry = entries[index] ?? 'pipe';
			if (entry === 'pipe' || entry === 'ignore') return entry;
			throw new SandboxError(
				'invalid-argument',
				`Cannot run "${command}" in a sandbox with stdio[${index}] = ${JSON.stringify(String(entry))}: only "pipe" and "ignore" are supported (an interactive terminal cannot reach a VM; route interactive steps to a worker without the "sandbox" label).`
			);
		};
		return [mode(0), mode(1), mode(2)];
	}
}
