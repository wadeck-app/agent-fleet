import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import type { DaemonToWorker, WorkerReady, WorkerSummary } from '../ipc/Protocol';

type WorkerState = 'idle' | 'busy';

/**
 * Shells `updateWorker` accepts for `shellCapabilities`.
 *
 * Mirrors `validShells` in `packages/flow-engine/src/validation/SchemaValidator.ts` (the
 * enum a step's own `shell:` field is checked against) -- same values, so a worker can
 * never be told it supports a shell no step is allowed to request. `sh` is deliberately
 * absent there and here, for the same reason (not a near-equivalent of `bash`).
 */
const VALID_SHELLS: readonly string[] = ['bash', 'cmd', 'pwsh'];

/** What a registered worker told the daemon about itself, plus its dispatch state. */
export interface RegisteredWorker {
	state: WorkerState;
	/**
	 * Daemon-assigned identity for this connection, recorded against every step it runs
	 * so an outcome is attributable to a specific worker (T-06). Assigned here rather
	 * than reported by the worker: a self-declared id could collide or be forged.
	 */
	workerId: string;
	pid: number;
	sourceId?: string;
	/** Routing labels only -- never an authorization decision (T-07). */
	labels: string[];
	attachedProjects: string[];
	hasUserInterface: boolean;
	/** Shells this worker can actually run -- never an authorization decision, routing only. */
	shellCapabilities: ('bash' | 'cmd' | 'pwsh')[];
	/**
	 * True when this daemon created the worker, so it exists only to serve this daemon
	 * and may be told to exit once there is nothing left to run.
	 *
	 * False for a worker launched outside the daemon -- a terminal the user opened, or
	 * another machine. Such a worker outlives the daemon by design (D#51): its
	 * persistence comes from being registered, not from holding the daemon open, and
	 * killing it on idle is exactly what made the core deliverable unusable (D#48).
	 */
	ephemeral: boolean;
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
	 * connection is normal: a worker sends `ready` again after each step.
	 *
	 * @param options.ephemeral - whether this daemon created the worker. Defaults to the
	 *        value already recorded, then to false: an unrecognised worker is never
	 *        treated as disposable, because being wrong in that direction kills a
	 *        worker the user launched.
	 */
	register(ws: WebSocket, registration: Omit<WorkerReady, 'type'>, options?: { ephemeral?: boolean }): void {
		// A re-registering connection keeps its id, so provenance stays stable across the
		// `ready` a forked worker sends after every step.
		const existing = this.workers.get(ws);
		const workerId = existing?.workerId ?? randomUUID();
		this.workers.set(ws, {
			state: 'idle',
			workerId,
			ephemeral: options?.ephemeral ?? existing?.ephemeral ?? false,
			pid: registration.pid,
			sourceId: registration.sourceId,
			// Documented defaults rather than inference: a worker that claims nothing is
			// unlabelled, attached to nothing, and headless until it says otherwise.
			labels: registration.labels ?? [],
			attachedProjects: registration.attachedProjects ?? [],
			hasUserInterface: registration.hasUserInterface ?? false,
			shellCapabilities: registration.shellCapabilities ?? [],
		});
	}

	remove(ws: WebSocket): void {
		this.workers.delete(ws);
	}

	/** Every live worker, for `flow worker list`. */
	summarize(): WorkerSummary[] {
		return [...this.workers.values()].map(worker => ({
			workerId: worker.workerId,
			pid: worker.pid,
			state: worker.state,
			...(worker.sourceId !== undefined ? { sourceId: worker.sourceId } : {}),
			labels: worker.labels,
			attachedProjects: worker.attachedProjects,
			hasUserInterface: worker.hasUserInterface,
			ephemeral: worker.ephemeral,
			shellCapabilities: worker.shellCapabilities,
		}));
	}

	/** Live workers belonging to one source, for enforcing its cap (D#64). */
	countForSource(sourceId: string): number {
		let count = 0;
		for (const worker of this.workers.values()) {
			if (worker.sourceId === sourceId) count++;
		}
		return count;
	}

	/** What this worker declared, or undefined when it is not registered. */
	describe(ws: WebSocket): RegisteredWorker | undefined {
		return this.workers.get(ws);
	}

	/**
	 * Updates labels and/or shell capabilities on an already-connected worker, in place --
	 * the same `RegisteredWorker` object `tryDispatch()` reads from, so the next dispatch
	 * sees the new values immediately (Proposal 3). No restart needed.
	 *
	 * Each field, when given, *replaces* the current list -- the same semantic
	 * `buildRegistration()` uses for a worker's initial `--labels`, not a merge.
	 *
	 * Daemon-registry only: this does not notify the worker process itself. Dispatch
	 * correctness is the actual point of this method, and `StepRouter`/`LabelMatcher`/
	 * `ShellMatcher` read straight from this registry -- the worker's own startup banner
	 * staying stale afterwards is cosmetic, and nothing here needs to fix it.
	 *
	 * @throws when neither field is given (nothing to update), a label is blank, a shell is
	 *         not one of `bash`/`cmd`/`pwsh`, or no live worker has this id -- an update that
	 *         silently did nothing would leave the caller believing dispatch now routes
	 *         differently when it does not.
	 */
	updateWorker(workerId: string, updates: { labels?: string[]; shellCapabilities?: string[] }): RegisteredWorker {
		if (updates.labels === undefined && updates.shellCapabilities === undefined) {
			throw new Error(
				`updateWorker("${workerId}") was given neither labels nor shellCapabilities to update -- nothing to do.`
			);
		}
		if (updates.labels?.some(label => label.trim() === '')) {
			throw new Error(
				`Worker labels must not be empty: ${JSON.stringify(updates.labels)} contains a blank entry, which no step could match.`
			);
		}
		if (updates.shellCapabilities !== undefined) {
			const invalid = updates.shellCapabilities.filter(shell => !VALID_SHELLS.includes(shell));
			if (invalid.length > 0) {
				throw new Error(
					`Unknown shell(s) ${invalid.map(s => `'${s}'`).join(', ')} for worker "${workerId}" -- expected one of: ${VALID_SHELLS.join(', ')}.`
				);
			}
		}

		for (const worker of this.workers.values()) {
			if (worker.workerId !== workerId) continue;
			if (updates.labels !== undefined) worker.labels = updates.labels;
			// violations-suppress: ts/no-unsafe-type-cast validated above against VALID_SHELLS, which lists exactly 'bash' | 'cmd' | 'pwsh'
			if (updates.shellCapabilities !== undefined) {
				worker.shellCapabilities = updates.shellCapabilities as ('bash' | 'cmd' | 'pwsh')[];
			}
			return worker;
		}

		const live = [...this.workers.values()].map(w => w.workerId);
		throw new Error(
			`No connected worker has id "${workerId}". ` +
				(live.length > 0
					? `Live worker ids: ${live.join(', ')}.`
					: 'No workers are currently connected.') +
				' Run "flow worker list" to see current ids.'
		);
	}

	/**
	 * Every idle worker with the connection to reach it, in registration order.
	 *
	 * Returns all of them rather than the first, because which one may run a given step is
	 * a routing decision this class deliberately knows nothing about (see `StepRouter`).
	 */
	listIdle(): { ws: WebSocket; worker: RegisteredWorker }[] {
		const idle: { ws: WebSocket; worker: RegisteredWorker }[] = [];
		for (const [ws, worker] of this.workers) {
			if (worker.state === 'idle') idle.push({ ws, worker });
		}
		return idle;
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

	/**
	 * Sends only to workers this daemon created.
	 *
	 * Used for the idle shutdown notice. A worker launched in a terminal must not receive
	 * it: it would exit, and the user would have to relaunch it after every idle period.
	 *
	 * There is deliberately no send-to-everyone counterpart. Broadcasting `done` to every
	 * connection is precisely what made `flow worker` unusable (D#48), so the capability
	 * is not offered.
	 */
	broadcastToEphemeral(message: DaemonToWorker): void {
		for (const [ws, worker] of this.workers) {
			if (worker.ephemeral) this.send(ws, message);
		}
	}

	/**
	 * Closes the sockets of workers this daemon did not create, without telling them to
	 * exit.
	 *
	 * Needed for the daemon to be able to shut down at all: an open WebSocket is a
	 * referenced handle, so leaving these connected keeps the process alive after it has
	 * deleted its port file and stopped serving commands -- an invisible orphan, while the
	 * next `flow run` starts a second daemon. Closing the socket is not the same as
	 * shutting the worker down: it re-registers when a daemon is available again (D#51).
	 */
	disconnectExternal(): void {
		for (const [ws, worker] of this.workers) {
			if (!worker.ephemeral) ws.close();
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
