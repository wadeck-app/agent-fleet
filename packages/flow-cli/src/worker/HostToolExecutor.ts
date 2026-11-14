import { DefaultProcessLauncher, type HostTool } from 'flow-engine';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { HostToolArgv } from './HostToolArgv';
import type { HostToolCallReply } from './HostToolCallTypes';
import { HostToolEnvironment } from './HostToolEnvironment';
import type { HostToolExecutableResolver, ResolvedHostExecutable } from './HostToolExecutableResolver';
import { HostToolHeadCapture } from './HostToolHeadCapture';
import type { ResolvedHostToolLimits } from './HostToolLimits';
import { HostToolReplyFormatter } from './HostToolReplyFormatter';
import { HostToolTailCapture } from './HostToolTailCapture';
import { Utf8Boundary } from './Utf8Boundary';

export interface HostToolExecutorOptions {
	/** The worker's own environment, read at each call: declared NAMES are looked up here, never in the call. */
	workerEnvironment: Readonly<Record<string, string | undefined>>;
	resolver: HostToolExecutableResolver;
	/** Ends a process and everything it started. Injected for tests; the default is the repo's tree killer. */
	killProcessTree?: (pid: number) => void;
	/** Defaults to the real platform; tests inject another to exercise the POSIX rules everywhere. */
	platform?: NodeJS.Platform;
	/** `child_process.spawn`; tests wrap it to see the options. */
	spawnProcess?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
	/** `process.kill`; a negative pid addresses a process group. Tests record the calls. */
	signalProcess?: (pid: number, signal: NodeJS.Signals) => unknown;
}

/** One validated call, ready to run. */
export interface HostToolExecution {
	stepId: string;
	tool: HostTool;
	/** Resolved at run start; its identity is re-verified right before the spawn. */
	executable: ResolvedHostExecutable;
	/** The values the checker accepted (all strings). */
	values: Readonly<Record<string, string>>;
	limits: ResolvedHostToolLimits;
	/** The run's workspace directory (`cwd: workspace`). */
	workspaceDir: string;
	/** Aborts when the step ends or the connection closes: the process tree is ended at once and nothing more runs. */
	signal?: AbortSignal;
}

export interface HostToolExecutionResult {
	reply: HostToolCallReply;
	durationMs: number;
	/** Bytes the process wrote to stdout, kept or not. */
	stdoutBytes: number;
	/** Declared env names that are never passed (names only). */
	envDenied: string[];
	/** Declared env names the worker does not have. */
	envMissing: string[];
	/** Why the process did not run or could not start (no tool output in it, safe for the audit log). */
	problem?: string;
	/** True when the call was stopped by its signal: its reply is not delivered anywhere. */
	aborted?: boolean;
}

interface RawOutcome {
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	/** Set when the signal ended the call. */
	aborted?: boolean;
	stdout: HostToolHeadCapture;
	stderr: HostToolTailCapture;
	notes: string[];
	/** Set when the process could not be started at all. */
	startFailure?: string;
}

/** How long after the kill the executor stops waiting for the process to be reported as ended. */
const KILL_GRACE_MS = 5_000;

/**
 * Runs ONE validated host tool call on the worker's host: `spawn(absolutePath, argv, {shell:false})`, no shell, no
 * globbing. The environment is the baseline plus the NAMES the tool declares (never the worker's credentials or the
 * per-step tokens), the working directory is the workspace or a fresh empty directory removed afterwards, and the
 * process tree is ended when `timeoutSeconds` elapse. The reply is capped and wrapped as untrusted data
 * ({@link HostToolReplyFormatter}). Never throws for a tool problem: it answers `ok:false` with an actionable text.
 */
export class HostToolExecutor {
	private readonly killTree: (pid: number) => void;
	private readonly platform: NodeJS.Platform;
	private readonly spawnProcess: NonNullable<HostToolExecutorOptions['spawnProcess']>;
	private readonly signalProcess: NonNullable<HostToolExecutorOptions['signalProcess']>;

	constructor(private readonly options: HostToolExecutorOptions) {
		this.platform = options.platform ?? process.platform;
		this.spawnProcess = options.spawnProcess ?? spawn;
		this.signalProcess = options.signalProcess ?? ((pid, signal) => process.kill(pid, signal));
		// The tree kill goes through the ProcessLauncher seam like every other process end (flow-engine ProcessLauncherSeam guard).
		this.killTree =
			options.killProcessTree ?? ((pid: number): void => new DefaultProcessLauncher().killTree(pid, 'SIGKILL'));
	}

	async execute(execution: HostToolExecution): Promise<HostToolExecutionResult> {
		const started = Date.now();
		const { stepId, tool, executable, limits } = execution;
		const environment = HostToolEnvironment.build(this.options.workerEnvironment, tool.env ?? []);
		const refuse = (problem: string): HostToolExecutionResult => ({
			reply: {
				ok: false,
				text: Utf8Boundary.prefixOfText(`Tool '${tool.id}' was not run: ${problem}`, limits.maxOutputBytes),
				truncated: false,
				exitCode: null,
			},
			durationMs: Date.now() - started,
			stdoutBytes: 0,
			envDenied: environment.denied,
			envMissing: environment.missing,
			problem,
		});

		const abortedBeforeSpawn = (): HostToolExecutionResult => ({
			...refuse(`the call was aborted (${String(execution.signal?.reason)}) before the process started`),
			aborted: true,
		});
		if (HostToolExecutor.isAborted(execution.signal)) return abortedBeforeSpawn();

		let argv: string[];
		try {
			// Right before the spawn: a path or identity that changed since the run started is refused (F-16).
			this.options.resolver.verify(stepId, executable);
			argv = HostToolArgv.build(tool, execution.values);
		} catch (error) {
			return refuse(error instanceof Error ? error.message : String(error));
		}

		let directory: { cwd: string; remove: () => Promise<string | undefined> };
		try {
			directory = await this.prepareDirectory(execution);
		} catch (error) {
			return refuse(error instanceof Error ? error.message : String(error));
		}

		// The directory was prepared asynchronously: the signal may have fired meanwhile, and nothing must be spawned then.
		const outcome = HostToolExecutor.isAborted(execution.signal)
			? undefined
			: await this.run(execution, argv, directory.cwd, environment.env);
		const removalProblem = await directory.remove();
		if (outcome === undefined) return abortedBeforeSpawn();
		if (removalProblem !== undefined) outcome.notes.push(removalProblem);
		const result = {
			durationMs: Date.now() - started,
			stdoutBytes: outcome.stdout.totalBytes,
			envDenied: environment.denied,
			envMissing: environment.missing,
		};
		if (outcome.aborted === true) {
			return {
				...result,
				aborted: true,
				reply: {
					ok: false,
					text: Utf8Boundary.prefixOfText(
						`Tool '${tool.id}' was stopped: the call was aborted (${String(execution.signal?.reason)}).`,
						limits.maxOutputBytes
					),
					truncated: false,
					exitCode: null,
				},
			};
		}
		if (outcome.startFailure !== undefined) {
			return {
				...result,
				problem: outcome.startFailure,
				reply: {
					ok: false,
					text: Utf8Boundary.prefixOfText(
						`Tool '${tool.id}' could not start: ${outcome.startFailure}. Fix: check that '${executable.absolutePath}' can be run by the worker's user.`,
						limits.maxOutputBytes
					),
					truncated: false,
					exitCode: null,
				},
			};
		}
		return {
			...result,
			reply: HostToolReplyFormatter.format({
				toolId: tool.id,
				stdout: outcome.stdout.bytes(),
				stdoutTruncated: outcome.stdout.truncated,
				stderr: outcome.stderr.bytes(),
				exitCode: outcome.timedOut ? null : outcome.exitCode,
				signal: outcome.timedOut ? null : outcome.signal,
				timedOut: outcome.timedOut,
				timeoutSeconds: limits.timeoutSeconds,
				maxOutputBytes: limits.maxOutputBytes,
				notes: outcome.notes,
			}),
		};
	}

	/**
	 * `workspace`: the run's workspace, which must exist. `none`: a FRESH empty directory (a new subdirectory of the OS
	 * temp directory, never the temp directory itself) that is removed after the call.
	 */
	private async prepareDirectory(
		execution: HostToolExecution
	): Promise<{ cwd: string; remove: () => Promise<string | undefined> }> {
		if (execution.limits.cwd === 'workspace') {
			const isDirectory = await fs.promises.stat(execution.workspaceDir).then(
				stat => stat.isDirectory(),
				() => false
			);
			if (!isDirectory) {
				throw new Error(
					`the workspace directory '${execution.workspaceDir}' does not exist. Fix: this is a worker problem, the run's workspace was removed or never created.`
				);
			}
			return { cwd: execution.workspaceDir, remove: async () => undefined };
		}
		const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flow-hosttool-none-'));
		return {
			cwd,
			remove: async () => {
				try {
					await fs.promises.rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
					return undefined;
				} catch (error) {
					return `Could not remove the temporary working directory '${cwd}': ${error instanceof Error ? error.message : String(error)}.`;
				}
			},
		};
	}

	private run(
		execution: HostToolExecution,
		argv: string[],
		cwd: string,
		env: Record<string, string>
	): Promise<RawOutcome> {
		const { executable, limits } = execution;
		return new Promise(resolve => {
			const outcome: RawOutcome = {
				exitCode: null,
				signal: null,
				timedOut: false,
				stdout: new HostToolHeadCapture(limits.maxOutputBytes),
				stderr: new HostToolTailCapture(HostToolReplyFormatter.STDERR_TAIL_BYTES),
				notes: [],
			};
			let child: ChildProcess;
			try {
				child = this.spawnProcess(executable.absolutePath, argv, {
					shell: false,
					windowsHide: true,
					// POSIX: the tool leads its own process group, so the whole group can be signalled even when a
					// descendant was double-forked (its parent gone, which `pgrep -P` cannot follow). Windows: taskkill /T.
					detached: this.platform !== 'win32',
					cwd,
					env,
					stdio: ['ignore', 'pipe', 'pipe'],
				});
			} catch (error) {
				outcome.startFailure = error instanceof Error ? error.message : String(error);
				resolve(outcome);
				return;
			}
			let settled = false;
			let deadline: NodeJS.Timeout | undefined;
			const settle = (): void => {
				if (settled) return;
				settled = true;
				execution.signal?.removeEventListener('abort', onAbort);
				clearTimeout(timer);
				if (deadline !== undefined) clearTimeout(deadline);
				resolve(outcome);
			};
			child.stdout!.on('data', (chunk: Buffer) => outcome.stdout.push(chunk));
			child.stderr!.on('data', (chunk: Buffer) => outcome.stderr.push(chunk));
			child.once('error', error => {
				// Before the process exists this is a start failure; later it is only worth a note.
				if (child.pid === undefined) outcome.startFailure = error.message;
				else outcome.notes.push(`Process error: ${error.message}`);
				settle();
			});
			child.once('close', (code, signal) => {
				outcome.exitCode = code;
				outcome.signal = signal;
				settle();
			});
			// Sync: the tree is killed before the abort() that triggered this returns; the reply is dropped by the caller.
			const onAbort = (): void => {
				if (settled) return;
				outcome.aborted = true;
				this.stopTree(child, outcome);
				child.stdout!.destroy();
				child.stderr!.destroy();
				settle();
			};
			execution.signal?.addEventListener('abort', onAbort, { once: true });
			const timer = setTimeout(() => {
				outcome.timedOut = true;
				this.stopTree(child, outcome);
				// Open pipes held by an orphan must not keep the call alive once the tree is ended.
				child.stdout!.destroy();
				child.stderr!.destroy();
				deadline = setTimeout(() => {
					outcome.notes.push(
						`The process did not report its end ${KILL_GRACE_MS / 1000} s after being stopped; it may still be running.`
					);
					settle();
				}, KILL_GRACE_MS);
			}, limits.timeoutSeconds * 1000);
		});
	}

	/** A function, not an inline read: TypeScript would keep the narrowing of the first check across the awaits. */
	private static isAborted(signal: AbortSignal | undefined): boolean {
		return signal?.aborted === true;
	}

	private stopTree(child: ChildProcess, outcome: RawOutcome): void {
		if (child.pid === undefined) return;
		try {
			this.killTree(child.pid);
		} catch (error) {
			outcome.notes.push(
				`Could not stop the process tree: ${error instanceof Error ? error.message : String(error)}. The tool may still be running.`
			);
			child.kill();
		}
		if (this.platform !== 'win32') this.killProcessGroup(child.pid, outcome);
	}

	/** After the tree kill (which needs the parent links): whatever is left in the tool's group, double-forked ones included. */
	private killProcessGroup(pid: number, outcome: RawOutcome): void {
		try {
			this.signalProcess(-pid, 'SIGKILL');
		} catch (error) {
			// ESRCH: the group has no member left, which is the goal.
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
			outcome.notes.push(
				`Could not stop the process group: ${error instanceof Error ? error.message : String(error)}. The tool may still be running.`
			);
		}
	}
}
