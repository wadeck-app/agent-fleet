import type { ShutdownReason } from '@wadeck-app/singleton-daemon-kit';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import { writeDaemonLog } from './DaemonLog.js';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { awaitShutdownWork, shutDownWorkers } from './DaemonWorkerShutdown.js';
import { DEFAULT_DISPOSE_TIMEOUT_MS } from './WorkerTypeInstances.js';
import { removeWorkerPort } from './publishWorkerPort.js';

/**
 * How long forked workers get to exit after the daemon told them to (and closed their sockets) before being killed.
 * Longer than the grace WebSocketServer gives its peers, so a worker that merely closes slowly is not killed.
 */
export const FORKED_WORKER_EXIT_GRACE_MS = 5_000;

export interface DaemonShutdownSequenceDeps {
	logsDir: string;
	daemonDir: string;
	workerAckTimeoutSeconds: number;
	eventPublisher: FlowEventPublisher;
	/** Undefined until the start hook built the components; a stop before that has no workers to tell. */
	getRuntimeIfStarted: () => DaemonRuntime | undefined;
	stopUpdateCheck: () => void;
	/** Stops the idle watchdog and any pending debounced stop. */
	disposeIdleShutdown: () => void;
	stopStalledSweep: () => void;
	/** Ends forked workers that ignored the request to exit, once the grace has passed. */
	terminateForkedWorkers: (graceMs: number) => void;
	/** The port the worker listener bound, or undefined if it never did. */
	getWorkerListenerPort: () => number | undefined;
}

/**
 * What happens on every stop path of the daemon (idle, signal, command, error, update), in order. The hook of the
 * daemon kit is synchronous, so the asynchronous part is kept in {@link pending} for stop() to wait for.
 */
export class DaemonShutdownSequence {
	private pending: Promise<void> = Promise.resolve();

	constructor(private readonly deps: DaemonShutdownSequenceDeps) {}

	/** Resolves when the event flush and the workers' answers are done. */
	whenSettled(): Promise<void> {
		return this.pending;
	}

	run(reason: ShutdownReason): void {
		const { logsDir } = this.deps;
		// Idle stops log their own line (with a snapshot); the others used to leave no trace of who stopped what.
		if (reason !== 'idle') {
			writeDaemonLog(logsDir, 'info', `Daemon stopped (${reason}) (pid ${String(process.pid)})`);
		}
		this.deps.stopUpdateCheck();
		// Every stop path, not only the idle one: a pending debounced stop, the watchdog and the background
		// work must not outlive the decision to stop (they would run against a torn-down daemon).
		this.deps.disposeIdleShutdown();
		this.deps.stopStalledSweep();
		const runtime = this.deps.getRuntimeIfStarted();
		runtime?.commandHandler.stopBackgroundWork();
		// Every stop path releases the worker listener, not only the idle one. An open listener and
		// connected workers keep the process alive after its command server is gone: an orphan holding a
		// worker port that the next daemon then has to scan past, until none is left.
		// The runs in progress are told first (run_end), then the workers are closed; see shutDownWorkers.
		// Capped in total: two ack timeouts (the acks, then the plugins' run hooks) plus the plugin dispose bound.
		const stopCapMs = 2 * this.deps.workerAckTimeoutSeconds * 1000 + DEFAULT_DISPOSE_TIMEOUT_MS;
		const workersAnswered =
			runtime === undefined
				? Promise.resolve()
				: shutDownWorkers(runtime, stopCapMs, maxWaitMs => {
						writeDaemonLog(
							logsDir,
							'error',
							`Stopping: the workers and worker types did not finish within ${String(Math.round(maxWaitMs / 1000))}s; the daemon stops anyway. ` +
								'Whatever a plugin still holds (for example sandboxes) may be left behind: remove it by hand.'
						);
					});
		// After the polite request above (done + closed sockets): one that still runs after the grace is wedged.
		this.deps.terminateForkedWorkers(FORKED_WORKER_EXIT_GRACE_MS);
		// The file tells workers where to dial; left behind it names a port nobody serves (or, later,
		// something unrelated). Only removed if it still names OURS: a daemon that replaced this one may
		// already have published its own.
		const workerListenerPort = this.deps.getWorkerListenerPort();
		if (workerListenerPort !== undefined) {
			removeWorkerPort(this.deps.daemonDir, workerListenerPort);
		}
		// The hook is synchronous: the flush runs on, and stop() waits for it. Pushes in flight
		// also keep the process alive until they settle.
		const eventsFlushed = this.deps.eventPublisher.flush().catch((err: unknown) => {
			writeDaemonLog(logsDir, 'error', `Queue events: flush at shutdown failed: ${getErrorMessage(err)}`);
		});
		// The hook can run twice (idle path, then stop()); the run_end wait is the same one both times.
		this.pending = awaitShutdownWork(eventsFlushed, workersAnswered);
	}
}
