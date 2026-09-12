import type { WebSocket } from 'ws';

import type { DaemonToWorker, WorkerReady } from '../ipc/Protocol';

type WorkerState = 'idle' | 'busy';

/** What a registered worker told the daemon about itself, plus its dispatch state. */
export interface RegisteredWorker {
	state: WorkerState;
	pid: number;
	sourceId?: string;
	/** Routing labels only -- never an authorization decision (T-07). */
	labels: string[];
	attachedProjects: string[];
	hasUserInterface: boolean;
}

/**
 * The live workers currently connected to this daemon.
 *
 * Holds connection state only. It deliberately knows nothing about how a worker came
 * to exist -- forked child, terminal the user opened, or remote host -- because that
 * is a source's business (P-1), and because capacity must be counted from live
 * connections rather than from child-process lifecycle (D#14). An inbound worker has
 * no child process for the daemon to observe, so an `exit`-handler count cannot see it.
 */
export class WorkerRegistry {
	private readonly workers = new Map<WebSocket, RegisteredWorker>();

	/** Number of connected workers, whatever their state. */
	get liveCount(): number {
		return this.workers.size;
	}

	/** Number of connected workers currently available for a step. */
	get idleCount(): number {
		let count = 0;
		for (const worker of this.workers.values()) {
			if (worker.state === 'idle') count++;
		}
		return count;
	}

	/**
	 * Adds a worker as idle, or refreshes an existing one. Re-registering the same
	 * connection is normal: a forked worker sends `ready` again after each step.
	 */
	register(ws: WebSocket, registration: Omit<WorkerReady, 'type'>): void {
		this.workers.set(ws, {
			state: 'idle',
			pid: registration.pid,
			sourceId: registration.sourceId,
			// Documented defaults rather than inference: a worker that claims nothing is
			// unlabelled, attached to nothing, and headless until it says otherwise.
			labels: registration.labels ?? [],
			attachedProjects: registration.attachedProjects ?? [],
			hasUserInterface: registration.hasUserInterface ?? false,
		});
	}

	remove(ws: WebSocket): void {
		this.workers.delete(ws);
	}

	/** What this worker declared, or undefined when it is not registered. */
	describe(ws: WebSocket): RegisteredWorker | undefined {
		return this.workers.get(ws);
	}

	getIdle(): WebSocket | undefined {
		for (const [ws, worker] of this.workers) {
			if (worker.state === 'idle') return ws;
		}
		return undefined;
	}

	markBusy(ws: WebSocket): void {
		this.setState(ws, 'busy');
	}

	markIdle(ws: WebSocket): void {
		this.setState(ws, 'idle');
	}

	hasBusyWorkers(): boolean {
		for (const worker of this.workers.values()) {
			if (worker.state === 'busy') return true;
		}
		return false;
	}

	send(ws: WebSocket, message: DaemonToWorker): boolean {
		if (ws.readyState !== ws.OPEN) return false;
		ws.send(JSON.stringify(message));
		return true;
	}

	broadcast(message: DaemonToWorker): void {
		for (const ws of this.workers.keys()) {
			this.send(ws, message);
		}
	}

	/**
	 * Only ever updates a worker already present. Creating an entry here would
	 * resurrect a worker that has already disconnected, and it would be counted as
	 * capacity that does not exist.
	 */
	private setState(ws: WebSocket, state: WorkerState): void {
		const worker = this.workers.get(ws);
		if (worker === undefined) return;
		worker.state = state;
	}
}
