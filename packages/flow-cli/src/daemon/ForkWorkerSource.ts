import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MASKING_FAILED, MIN_SECRET_LENGTH, SecretMasker } from '../secrets/SecretMasker.js';
import { BoundedLineBuffer } from './BoundedLineBuffer.js';

/** What is kept of a worker's stderr to explain its death: the tail, in lines and in bytes. */
const STDERR_TAIL_LINES = 40;
const STDERR_TAIL_BYTES = 8 * 1024;
/** After 'exit', how long to wait for the stderr pipe to close before logging with what was read. */
const STDERR_DRAIN_GRACE_MS = 250;

export type WorkerLog = (level: 'info' | 'error', message: string) => void;

export interface ForkWorkerSourceOptions {
	/** Where worker lifecycle lines go. The daemon passes its log: its own stderr is ignored when detached. */
	log?: WorkerLog;
	/** Hides secrets in the stderr tail before it is logged (the daemon passes the executions' maskers). */
	maskText?: (text: string) => string;
}

function stderrLog(level: 'info' | 'error', message: string): void {
	process.stderr.write(`[ForkWorkerSource] ${level}: ${message}
`);
}

/** Workers that do not connect back within this window are killed as orphans. */
const WORKER_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Built-in `worker-source` implementation that forks a worker as a local child process.
 *
 * This is what the daemon used to do inline. It is a source implementation rather than
 * a core component precisely so `fork` is not the one hardcoded way to get capacity
 * (P-1): an inbound terminal or a remote host is a different implementation of the same
 * single method, not a second branch next to this one.
 *
 * `authToken` from the request is ignored: the child is a loopback process this daemon
 * created, so it needs no credential to be recognised (D#27). Any implementation that
 * reaches off-loopback must require one.
 */
export class ForkWorkerSource implements WorkerSourceProvider {
	/** Pids spawned by this source, awaiting or holding a connection. */
	private readonly spawnedPids = new Set<number>();
	/** Pid -> orphan-kill timer, cleared once the worker connects. */
	private readonly pendingConnects = new Map<number, ReturnType<typeof setTimeout>>();
	/** Workers spawned and not yet exited, so shutdown can end the ones that ignore the polite request. */
	private readonly running = new Map<number, ChildProcess>();
	private terminateTimer: ReturnType<typeof setTimeout> | undefined;

	readonly workerPath: string;
	readonly tsxLoaderPath: string | null;
	private readonly claudePath: string;
	private readonly log: WorkerLog;
	private readonly maskText: (text: string) => string;

	constructor(
		private readonly httpPort: number,
		/** Port or lazy getter -- evaluated at spawn time so an async port retry resolves first. */
		private readonly wsPortOrGetter: number | (() => number),
		claudePath?: string,
		options: ForkWorkerSourceOptions = {}
	) {
		this.claudePath = claudePath ?? '';
		this.log = options.log ?? stderrLog;
		this.maskText = options.maskText ?? ((text: string) => text);

		// Dev mode: compiled Worker.js plus the tsx loader for extension-less ESM imports.
		const devWorkerPath = fileURLToPath(new URL('../../dist/worker/Worker.js', import.meta.url));
		// Bundled mode: co-located worker.cjs, no loader needed.
		const bundledWorkerPath = fileURLToPath(new URL('./worker.cjs', import.meta.url));

		if (existsSync(devWorkerPath)) {
			this.workerPath = devWorkerPath;
			// Node's --import requires a file:// URL; a Windows path is not accepted as-is.
			this.tsxLoaderPath = new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
		} else if (existsSync(bundledWorkerPath)) {
			this.workerPath = bundledWorkerPath;
			this.tsxLoaderPath = null;
		} else {
			throw new Error(`Worker not found. Checked:\n  dev:     ${devWorkerPath}\n  bundled: ${bundledWorkerPath}`);
		}
	}

	/** Workers spawned but not yet connected. Counted as committed capacity. */
	get pendingCount(): number {
		return this.pendingConnects.size;
	}

	/**
	 * True when this source spawned the given pid.
	 *
	 * Used to recognise a forked worker until token authentication replaces provenance
	 * (Phase 2a). It is not a general authentication mechanism: a worker this daemon did
	 * not spawn has no pid it can recognise, which is exactly why S7 exists (T-01).
	 */
	hasSpawned(pid: number): boolean {
		return this.spawnedPids.has(pid);
	}

	/** Cancels the orphan-kill timer once the worker has registered. */
	acknowledgeConnection(pid: number): void {
		const timer = this.pendingConnects.get(pid);
		if (timer === undefined) {
			return;
		}
		clearTimeout(timer);
		this.pendingConnects.delete(pid);
	}

	async obtainWorker(_request: WorkerRequest): Promise<void> {
		const spawnArgs = this.tsxLoaderPath ? ['--import', this.tsxLoaderPath, this.workerPath] : [this.workerPath];
		// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so the worker's own children allocate a visible console; the worker must inherit the daemon's hidden console (d032e7e). Guarded by ForkWorkerSource.windows-console.test.ts
		const child = spawn(process.execPath, spawnArgs, {
			env: this.buildEnv(),
			stdio: ['ignore', 'ignore', 'pipe'],
		});

		if (child.pid === undefined) {
			// Loud: a silently dropped spawn would leave demand unmet with no explanation.
			throw new Error('ForkWorkerSource: spawn produced no pid, so no worker will join');
		}
		const pid = child.pid;
		this.spawnedPids.add(pid);
		this.running.set(pid, child);

		// A worker that never connects would otherwise hold a capacity slot indefinitely.
		const connectTimeout = setTimeout(() => {
			this.pendingConnects.delete(pid);
			if (!child.killed) {
				this.log(
					'error',
					`worker pid ${String(pid)} did not connect within ${WORKER_CONNECT_TIMEOUT_MS}ms -- killing`
				);
				child.kill('SIGKILL');
			}
		}, WORKER_CONNECT_TIMEOUT_MS);
		this.pendingConnects.set(pid, connectTimeout);

		const stderrTail = new BoundedLineBuffer(STDERR_TAIL_LINES, STDERR_TAIL_BYTES);
		let reported = false;
		const report = (code: number | null, signal: NodeJS.Signals | null): void => {
			if (reported) {
				return;
			}
			reported = true;
			this.reportExit(pid, code, signal, stderrTail.snapshot());
		};

		// Without a handler a launch failure (e.g. ENOENT) is an unhandled 'error' event that kills the daemon.
		child.on('error', (err: Error) => {
			this.log('error', `worker pid ${String(pid)} process error: ${String(err)}`);
		});
		child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
			clearTimeout(connectTimeout);
			this.pendingConnects.delete(pid);
			this.spawnedPids.delete(pid);
			this.running.delete(pid);
			// Everything the shutdown was waiting for is gone: nothing left to kill, and the timer must not hold the exit.
			if (this.running.size === 0 && this.terminateTimer !== undefined) {
				clearTimeout(this.terminateTimer);
				this.terminateTimer = undefined;
			}
			// 'close' follows once stderr is drained; a grandchild holding the pipe could delay it forever.
			setTimeout(() => report(code, signal), STDERR_DRAIN_GRACE_MS).unref();
		});
		child.on('close', (code: number | null, signal: NodeJS.Signals | null) => report(code, signal));
		child.stderr?.on('data', (data: Buffer) => {
			const text = data.toString();
			stderrTail.append(text);
			process.stderr.write(`[worker] ${text}`);
		});
	}

	/**
	 * For the daemon's shutdown: workers were asked to exit (`done`, and their socket is closed); any still running after
	 * `graceMs` is killed. A worker that ignores both (wedged, its event loop blocked) would otherwise outlive the daemon
	 * that owned it. Nothing is scheduled when no worker runs, and the timer is cancelled as soon as the last one exits, so
	 * it never delays the daemon's own exit.
	 */
	terminateRemaining(graceMs: number): void {
		if (this.running.size === 0 || this.terminateTimer !== undefined) {
			return;
		}
		this.terminateTimer = setTimeout(() => {
			this.terminateTimer = undefined;
			for (const [pid, child] of this.running) {
				this.log(
					'error',
					`worker pid ${String(pid)} was still running ${String(graceMs)}ms after the daemon stopped -- killing`
				);
				child.kill('SIGKILL');
			}
		}, graceMs);
	}

	/** Writes how the worker ended and the tail of its stderr, masked: the only record of why it died. */
	private reportExit(pid: number, code: number | null, signal: NodeJS.Signals | null, stderrTail: string): void {
		const abnormal = signal !== null || code !== 0;
		const how = signal !== null ? `signal ${signal}` : `code ${String(code)}`;
		this.log(abnormal ? 'error' : 'info', `worker pid ${String(pid)} exited with ${how}`);
		if (stderrTail !== '') {
			this.log(
				abnormal ? 'error' : 'info',
				`worker pid ${String(pid)} last stderr (up to ${String(STDERR_TAIL_LINES)} lines):
${this.mask(stderrTail)}`
			);
		}
	}

	/** Never logs raw text: a masker that throws replaces the whole tail. */
	private mask(text: string): string {
		try {
			return this.maskText(this.maskForwardedKey(text));
		} catch {
			return MASKING_FAILED;
		}
	}

	/** The one credential this source puts in the worker's environment itself (see buildEnv). */
	private maskForwardedKey(text: string): string {
		const key = process.env['ANTHROPIC_API_KEY'];
		if (key === undefined || key.length < MIN_SECRET_LENGTH) {
			return text;
		}
		return new SecretMasker(new Map([['ANTHROPIC_API_KEY', key]])).mask(text);
	}

	/** Deliberately allow-listed: the worker inherits only what it needs. */
	private buildEnv(): Record<string, string> {
		const wsPort = typeof this.wsPortOrGetter === 'function' ? this.wsPortOrGetter() : this.wsPortOrGetter;
		return {
			FLOW_DAEMON_PORT: String(this.httpPort),
			FLOW_WS_PORT: String(wsPort),
			// Resolved at daemon startup, so the worker does not depend on PATH lookup.
			...(this.claudePath ? { FLOW_CLAUDE_PATH: this.claudePath } : {}),
			...(process.env['PATH'] ? { PATH: process.env['PATH'] } : {}),
			...(process.env['HOME'] ? { HOME: process.env['HOME'] } : {}),
			...(process.env['ANTHROPIC_API_KEY'] ? { ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] } : {}),
			// Windows needs these for subprocess and temp-file resolution.
			...(process.platform === 'win32' && process.env['SystemRoot']
				? { SystemRoot: process.env['SystemRoot'] }
				: {}),
			...(process.platform === 'win32' && process.env['USERPROFILE']
				? { USERPROFILE: process.env['USERPROFILE'] }
				: {}),
			// Providers forward PATHEXT to model CLIs only when the worker has it (OpenCodeModelProvider);
			// without it the model's shell cannot resolve `npm` -> npm.cmd ("Broken PATHEXT in this shell").
			...(process.env['PATHEXT'] ? { PATHEXT: process.env['PATHEXT'] } : {}),
			...(process.env['TEMP'] ? { TEMP: process.env['TEMP'] } : {}),
			...(process.env['TMP'] ? { TMP: process.env['TMP'] } : {}),
			// Absolute path to bash.exe, resolved by the launcher before VBScript discards the Git
			// Bash PATH. Without it, ScriptExecutor would find WSL bash via the system PATH instead.
			...(process.env['FLOW_BASH_PATH'] ? { FLOW_BASH_PATH: process.env['FLOW_BASH_PATH'] } : {}),
			// Lets OpenCodeModelProvider auto-select OPENCODE_CONFIG by resolved model family
			// (see WindowsDaemonEnv.ts's PASSTHROUGH_ENV_VARS -- same forwarding gap, same fix).
			...(process.env['OPENCODE_CONFIG_OPENAI']
				? { OPENCODE_CONFIG_OPENAI: process.env['OPENCODE_CONFIG_OPENAI'] }
				: {}),
			...(process.env['OPENCODE_CONFIG_ANTHROPIC']
				? { OPENCODE_CONFIG_ANTHROPIC: process.env['OPENCODE_CONFIG_ANTHROPIC'] }
				: {}),
		};
	}
}
