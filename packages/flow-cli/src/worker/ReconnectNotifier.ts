/**
 * Notifies a waiting worker that a daemon is ready to accept connections.
 *
 * Two implementations exist: `NudgeServer` (HTTP POST, works across machines) and
 * `DaemonWatchNotifier` (filesystem event, local only). A worker runs both in parallel
 * and connects when either fires -- the first wins and cancels the other.
 *
 * The `wsUrl` passed to the callback is the daemon's WebSocket URL when known (nudge),
 * or `undefined` when the notifier only knows the daemon is ready but not its address
 * (local file-watch: the worker reads `worker.port` itself).
 */
export interface ReconnectNotifier {
	/**
	 * Registers the callback to invoke when a daemon signals readiness.
	 *
	 * Passing `undefined` disables the notification without releasing resources --
	 * the notifier stays alive and the next `onNotify` call re-arms it.
	 */
	onNotify(callback: ((wsUrl: string | undefined) => void) | undefined): void;
	/** Releases all resources. Safe to call more than once. */
	stop(): void;
}
