import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';

export interface StartDaemonOptions {
	/**
	 * Port for the daemon's command server. Omitted means the standard one, which is how a
	 * user's daemon becomes discoverable.
	 *
	 * Zero asks the OS for a free port, which is what tests need: the standard port is a
	 * fixed number shared with the user's own running daemon and with every other test
	 * daemon, so they collide and the loser writes a port file nothing is listening on.
	 */
	port?: number;
	/**
	 * Whether the daemon stops itself once it has nothing left to do. Omitted means yes, which is what a user's
	 * daemon does: the next `flow run` starts a new one. Tests pass false, because their client never restarts a
	 * daemon, so a second run sent after the first ended raced the idle timer and met a dead server.
	 */
	stopWhenIdle?: boolean;
	/**
	 * How often an idle-stopping daemon checks, on its own, whether it has nothing left to do (milliseconds). Omitted
	 * means `IDLE_WATCHDOG_INTERVAL_MS`. Ignored when `stopWhenIdle` is false. Tests lower it.
	 */
	idleCheckIntervalMs?: number;
	/**
	 * The packaged app-module to register with app-core on start. Omitted means the daemon does not
	 * talk to app-core at all (tests and embedders); the CLI entry always passes it.
	 */
	appCoreModules?: { id: string; manifestPath: string }[];
	/**
	 * Where the lifecycle events (flow.execution.*, flow.step.*) go. Omitted means none are published,
	 * which is what tests and embedders want; the CLI entry passes the queue-backed one.
	 */
	eventPublisher?: FlowEventPublisher;
	/**
	 * What to do when another daemon already owns the config dir. Omitted means `takeover`: the kit evicts it and this
	 * one replaces it, which is what a deliberate restart wants.
	 *
	 * `yield` is for daemons nobody asked to replace anything (every `flow run` auto-starts one, so concurrent runs
	 * start several): the late one logs a single line and leaves, WITHOUT touching state. A takeover there evicted
	 * the live daemon and its start-up reconciliation then marked the executions that daemon had just accepted as
	 * interrupted.
	 */
	existingDaemon?: 'takeover' | 'yield';
}

/** Refuses a value that would silently change behaviour: a zero or NaN interval would mean "never check". */
export function assertValidStartDaemonOptions(options: StartDaemonOptions): void {
	if (
		options.idleCheckIntervalMs !== undefined &&
		!(Number.isFinite(options.idleCheckIntervalMs) && options.idleCheckIntervalMs > 0)
	) {
		throw new Error(
			`idleCheckIntervalMs must be a positive number of milliseconds, got ${String(options.idleCheckIntervalMs)}.`
		);
	}
}
