import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';

import type { DaemonToWorker } from '../ipc/Protocol';

type WorkerState = 'idle' | 'busy';

// Workers that do not connect via WebSocket within this window are killed.
const WORKER_CONNECT_TIMEOUT_MS = 10_000;

export class WorkerPool {
	private readonly workers = new Map<WebSocket, WorkerState>();
	// Maps worker PID → pending connect timeout handle.
	// Cleared when the worker sends its first 'ready' message (via registerWorker).
	private readonly pendingConnectTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
	// PIDs of processes spawned by this pool. Used to reject registration from external processes.
	private readonly spawnedPids = new Set<number>();
	private activeCount = 0;
	private readonly workerPath: string;
	private readonly claudePath: string;
	private readonly tsxLoaderPath: string;

	constructor(
		private readonly concurrencyLimit: number,
		private readonly httpPort: number,
		private readonly wsPort: number,
		// optional for backward compat — empty string means workers locate claude themselves
		claudePath?: string
	) {
		this.workerPath = fileURLToPath(new URL('../../dist/worker/Worker.js', import.meta.url));
		this.claudePath = claudePath ?? '';
		// tsx loader for resolving extension-less ESM imports in bundler-mode compiled output
		// Node.js --import requires a file:// URL (Windows paths not accepted as-is)
		// dist/daemon/ is 4 levels deep from monorepo root — use ../../../../ to reach root node_modules
		this.tsxLoaderPath = new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
	}

	canSpawn(): boolean {
		return this.activeCount < this.concurrencyLimit;
	}

	spawnWorker(): void {
		this.activeCount++;
		const child = spawn(process.execPath, ['--import', this.tsxLoaderPath, this.workerPath], {
			env: {
				// IPC: worker needs to know daemon location
				FLOW_DAEMON_PORT: String(this.httpPort),
				FLOW_WS_PORT: String(this.wsPort),
				// Claude binary path resolved at daemon startup — avoids PATH dependency in worker
				...(this.claudePath ? { FLOW_CLAUDE_PATH: this.claudePath } : {}),
				// PATH: needed for standard tools in script steps and shell resolution
				...(process.env['PATH'] ? { PATH: process.env['PATH'] } : {}),
				// HOME: needed by many tools and claude config lookup
				...(process.env['HOME'] ? { HOME: process.env['HOME'] } : {}),
				// ANTHROPIC_API_KEY: required for model steps — passed explicitly, not via spread
				...(process.env['ANTHROPIC_API_KEY'] ? { ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] } : {}),
				// Windows-specific vars required for subprocess and temp file resolution
				...(process.platform === 'win32' && process.env['SystemRoot']
					? { SystemRoot: process.env['SystemRoot'] }
					: {}),
				...(process.platform === 'win32' && process.env['USERPROFILE']
					? { USERPROFILE: process.env['USERPROFILE'] }
					: {}),
				...(process.env['TEMP'] ? { TEMP: process.env['TEMP'] } : {}),
				...(process.env['TMP'] ? { TMP: process.env['TMP'] } : {}),
			},
			detached: false,
			stdio: ['ignore', 'ignore', 'pipe'],
		});

		if (child.pid === undefined) {
			this.activeCount--;
			process.stderr.write('[WorkerPool] spawn produced no PID — aborting worker\n');
			return;
		}
		const pid = child.pid;
		this.spawnedPids.add(pid);

		// Kill the worker if it hasn't sent 'ready' within the timeout.
		// This prevents orphaned workers from consuming a concurrency slot indefinitely.
		const connectTimeout = setTimeout(() => {
			this.pendingConnectTimeouts.delete(pid);
			if (!child.killed) {
				process.stderr.write(
					`[worker] pid ${String(pid)} did not connect within ${WORKER_CONNECT_TIMEOUT_MS}ms — killing\n`
				);
				child.kill('SIGKILL');
			}
		}, WORKER_CONNECT_TIMEOUT_MS);
		this.pendingConnectTimeouts.set(pid, connectTimeout);

		child.on('exit', () => {
			clearTimeout(connectTimeout);
			this.pendingConnectTimeouts.delete(pid);
			this.spawnedPids.delete(pid);
			this.activeCount = Math.max(0, this.activeCount - 1);
		});
		child.stderr?.on('data', (data: Buffer) => {
			process.stderr.write(`[worker] ${data.toString()}`);
		});
	}

	registerWorker(ws: WebSocket, pid: number): void {
		// Reject registration from processes that were not spawned by this pool.
		// A rogue external process could otherwise cancel a real worker's connect timeout.
		if (!this.spawnedPids.has(pid)) {
			process.stderr.write(`[WorkerPool] rejected registration from unknown PID ${String(pid)}\n`);
			ws.terminate();
			return;
		}
		// Cancel the connect timeout — this worker connected successfully.
		const timer = this.pendingConnectTimeouts.get(pid);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.pendingConnectTimeouts.delete(pid);
		}
		this.workers.set(ws, 'idle');
	}

	removeWorker(ws: WebSocket): void {
		// Only removes the WebSocket from the registry. activeCount is decremented
		// exclusively in the child process 'exit' handler to avoid double-counting.
		this.workers.delete(ws);
	}

	getIdleWorker(): WebSocket | undefined {
		for (const [ws, state] of this.workers) {
			if (state === 'idle') return ws;
		}
		return undefined;
	}

	markBusy(ws: WebSocket): void {
		this.workers.set(ws, 'busy');
	}

	markIdle(ws: WebSocket): void {
		this.workers.set(ws, 'idle');
	}

	hasActiveWorkers(): boolean {
		return [...this.workers.values()].some(s => s === 'busy');
	}

	sendToWorker(ws: WebSocket, message: DaemonToWorker): boolean {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify(message));
			return true;
		}
		return false;
	}

	broadcastDone(): void {
		for (const [ws] of this.workers) {
			this.sendToWorker(ws, { type: 'done' });
		}
	}
}
