import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

	readonly workerPath: string;
	readonly tsxLoaderPath: string | null;
	private readonly claudePath: string;

	constructor(
		private readonly httpPort: number,
		/** Port or lazy getter -- evaluated at spawn time so an async port retry resolves first. */
		private readonly wsPortOrGetter: number | (() => number),
		claudePath?: string
	) {
		this.claudePath = claudePath ?? '';

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
		if (timer === undefined) return;
		clearTimeout(timer);
		this.pendingConnects.delete(pid);
	}

	// eslint-disable-next-line @typescript-eslint/require-await -- async by interface contract
	async obtainWorker(_request: WorkerRequest): Promise<void> {
		const spawnArgs = this.tsxLoaderPath ? ['--import', this.tsxLoaderPath, this.workerPath] : [this.workerPath];
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

		// A worker that never connects would otherwise hold a capacity slot indefinitely.
		const connectTimeout = setTimeout(() => {
			this.pendingConnects.delete(pid);
			if (!child.killed) {
				process.stderr.write(
					`[ForkWorkerSource] pid ${String(pid)} did not connect within ${WORKER_CONNECT_TIMEOUT_MS}ms -- killing\n`
				);
				child.kill('SIGKILL');
			}
		}, WORKER_CONNECT_TIMEOUT_MS);
		this.pendingConnects.set(pid, connectTimeout);

		child.on('exit', () => {
			clearTimeout(connectTimeout);
			this.pendingConnects.delete(pid);
			this.spawnedPids.delete(pid);
		});
		child.stderr?.on('data', (data: Buffer) => {
			process.stderr.write(`[worker] ${data.toString()}`);
		});
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
			...(process.env['TEMP'] ? { TEMP: process.env['TEMP'] } : {}),
			...(process.env['TMP'] ? { TMP: process.env['TMP'] } : {}),
		};
	}
}
