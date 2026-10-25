import { writeDaemonLog } from './DaemonLog.js';
import type { DaemonRuntime } from './DaemonRuntime.js';

/**
 * Grace period between the idle condition becoming true and the daemon actually stopping.
 *
 * `flow run` auto-starts the daemon, then dials it over IPC to submit the "run" command --
 * that is a separate connect-and-send round trip, not instant. A worker's own `'ready'`
 * message (e.g. a stale external worker reconnecting, or a daemon-forked source answering)
 * can land in that window and find the queue genuinely empty, because the run has not been
 * enqueued into `commandHandler` yet. Reacting immediately then stops the daemon before the
 * command it was started for ever arrives, leaving that execution stuck at `status: "queued"`
 * forever. 1s is well above the sub-150ms window observed in practice while costing nothing
 * once the daemon is actually idle -- it only delays a shutdown that was never time-critical.
 */
export const SHUTDOWN_GRACE_MS = 1_000;

/** Decides when the daemon has nothing left to do and stops it, after a grace period. */
export class DaemonIdleShutdown {
	/** checkShutdown() can be re-entered (e.g. a worker's own close event fires while
	 * its socket is also being torn down by this same shutdown): without this guard
	 * the idle-stop log line and the stop would both run twice. */
	private shuttingDown = false;
	/** Pending debounced shutdown (SHUTDOWN_GRACE_MS), or none scheduled. */
	private pendingShutdown: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly logsDir: string,
		private readonly runtime: () => DaemonRuntime,
		/** Stops the periodic work that must not outlive the decision to stop. */
		private readonly stopPeriodicWork: () => void,
		private readonly stopDaemon: () => Promise<void>
	) {}

	isIdle(): boolean {
		const { commandHandler, workerRegistry } = this.runtime();
		return (
			commandHandler.isQueueEmpty() &&
			!commandHandler.hasActiveExecutions() &&
			!workerRegistry.hasBusyWorkers() &&
			// A failed-on-unanswered-intervention execution is kept alive specifically so a
			// later `flow resume` can re-dispatch it (CommandHandler.handleResume) -- that only
			// works against this same daemon process's in-memory scheduler/context state, so
			// idle-exit must not tear it down just because nothing is queued or running right
			// this second.
			!commandHandler.hasResumableInterventions()
		);
	}

	/**
	 * One-line snapshot of every `isIdle()` input, for the idle-exit diagnostic log entries
	 * below -- see `CommandHandler.describeIdleState()` for why this exists.
	 */
	private diagnosticSnapshot(): string {
		const { commandHandler, workerRegistry } = this.runtime();
		return `${commandHandler.describeIdleState()} liveWorkers=${String(workerRegistry.liveCount)} idleWorkers=${String(workerRegistry.idleCount)}`;
	}

	/**
	 * Looks idle right now and schedules the actual stop after SHUTDOWN_GRACE_MS, rather than
	 * stopping synchronously -- see SHUTDOWN_GRACE_MS for why. The grace period re-checks
	 * idleness itself when it elapses, so nothing here needs to notice "something changed" and
	 * cancel early: a run that lands late simply finds the daemon still up and makes the
	 * recheck below see activity, at which point the schedule is dropped without acting.
	 */
	checkShutdown(): void {
		if (this.shuttingDown) {
			return;
		}
		if (!this.isIdle()) {
			if (this.pendingShutdown !== undefined) {
				clearTimeout(this.pendingShutdown);
				this.pendingShutdown = undefined;
				writeDaemonLog(
					this.logsDir,
					'info',
					`Idle shutdown cancelled, no longer idle (${this.diagnosticSnapshot()})`
				);
			}
			return;
		}
		// already scheduled
		if (this.pendingShutdown !== undefined) {
			return;
		}
		writeDaemonLog(
			this.logsDir,
			'info',
			`Idle detected, scheduling shutdown in ${String(SHUTDOWN_GRACE_MS)}ms (${this.diagnosticSnapshot()})`
		);
		this.pendingShutdown = setTimeout(() => {
			this.pendingShutdown = undefined;
			this.stopIfStillIdle();
		}, SHUTDOWN_GRACE_MS);
	}

	private stopIfStillIdle(): void {
		if (this.shuttingDown) {
			return;
		}
		if (!this.isIdle()) {
			writeDaemonLog(this.logsDir, 'info', `Idle shutdown skipped on recheck (${this.diagnosticSnapshot()})`);
			return;
		}
		this.shuttingDown = true;
		const { workerRegistry, commandHandler, wsServer } = this.runtime();
		// Only the workers this daemon forked are told to exit. A worker the user
		// launched in a terminal must survive an idle period: it is registered, not
		// owned (D#51), and telling it to exit is what made `flow worker` unusable
		// (D#48).
		workerRegistry.broadcastToEphemeral({ type: 'done' });
		// Their sockets are still closed, or the daemon could never exit: an open
		// WebSocket keeps the event loop alive, leaving an orphan process holding no
		// port file. The worker re-registers once a daemon is available again.
		workerRegistry.disconnectExternal();
		// Nothing queued for later may outlive the decision to stop: a pending dispatch
		// re-check would run against a closed listener.
		commandHandler.stopBackgroundWork();
		// Nothing is executing at this point, so a sweep would only run against a torn-down handler.
		this.stopPeriodicWork();
		// The update-check timer is cleared by the onShutdown hook, which fires for every stop()
		// path -- including the stop('idle') call just below.
		wsServer.close();
		writeDaemonLog(
			this.logsDir,
			'info',
			`Daemon stopped (idle) (pid ${String(process.pid)}) (${this.diagnosticSnapshot()})`
		);
		void this.stopDaemon();
	}
}
