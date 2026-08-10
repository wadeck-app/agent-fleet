import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';

import type { DaemonToWorker } from '../ipc/Protocol.js';

type WorkerState = 'idle' | 'busy';

// Workers that do not connect via WebSocket within this window are killed.
const WORKER_CONNECT_TIMEOUT_MS = 10_000;

export class WorkerPool {
	private readonly workers = new Map<WebSocket, WorkerState>();
	// Maps worker PID → pending connect timeout handle.
	// Cleared when the worker sends its first 'ready' message (via registerWorker).
	private readonly pendingConnectTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
	private activeCount = 0;
	private readonly workerPath: string;

	constructor(
		private readonly concurrencyLimit: number,
		private readonly httpPort: number,
		private readonly wsPort: number
	) {
		this.workerPath = fileURLToPath(new URL('../../dist/worker/Worker.js', import.meta.url));
	}

	canSpawn(): boolean {
		return this.activeCount < this.concurrencyLimit;
	}

	spawnWorker(): void {
		this.activeCount++;
		const child = spawn(process.execPath, [this.workerPath], {
			env: {
				FLOW_DAEMON_PORT: String(this.httpPort),
				FLOW_WS_PORT: String(this.wsPort),
			},
			detached: false,
			stdio: ['ignore', 'ignore', 'pipe'],
		});

		const pid = child.pid!;

		// Kill the worker if it hasn't sent 'ready' within the timeout.
		// This prevents orphaned workers from consuming a concurrency slot indefinitely.
		const connectTimeout = setTimeout(() => {
			this.pendingConnectTimeouts.delete(pid);
			if (!child.killed) {
				process.stderr.write(`[worker] pid ${String(pid)} did not connect within ${WORKER_CONNECT_TIMEOUT_MS}ms — killing\n`);
				child.kill('SIGKILL');
			}
		}, WORKER_CONNECT_TIMEOUT_MS);
		this.pendingConnectTimeouts.set(pid, connectTimeout);

		child.on('exit', () => {
			clearTimeout(connectTimeout);
			this.pendingConnectTimeouts.delete(pid);
			this.activeCount = Math.max(0, this.activeCount - 1);
		});
		child.stderr?.on('data', (data: Buffer) => {
			process.stderr.write(`[worker] ${data.toString()}`);
		});
	}

	registerWorker(ws: WebSocket, pid: number): void {
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

	hasActiveWorkers(): boolean {
		return [...this.workers.values()].some(s => s === 'busy');
	}

	sendToWorker(ws: WebSocket, message: DaemonToWorker): void {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	broadcastDone(): void {
		for (const [ws] of this.workers) {
			this.sendToWorker(ws, { type: 'done' });
		}
	}
}
