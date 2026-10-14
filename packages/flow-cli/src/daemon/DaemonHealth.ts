export type DaemonHealth = {
	status: 'ok';
	/**
	 * True while restarting the daemon would lose work: queued steps, an active execution, a busy
	 * worker, or a resumable intervention. Idle connected workers do not count -- they reconnect.
	 * The updater defers on this (see updater/entry.ts).
	 */
	work_in_flight: boolean;
	/** True while new runs are being refused so a pending update can proceed. */
	draining: boolean;
};

export function buildDaemonHealth(state: { isIdle: () => boolean; isDraining: () => boolean }): DaemonHealth {
	return { status: 'ok', work_in_flight: !state.isIdle(), draining: state.isDraining() };
}
