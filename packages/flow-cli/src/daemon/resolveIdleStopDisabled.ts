/** Environment variable that keeps the daemon alive when it is idle. */
export const NO_IDLE_STOP_ENV = 'FLOW_DAEMON_NO_IDLE_STOP';

/**
 * Whether the environment asks the daemon never to stop because it is idle.
 *
 * Meant for tests that run an isolated daemon and must not depend on the idle stop. Only an explicit stop (`flow stop`,
 * an update restart, a signal) ends such a daemon.
 *
 * @returns true for "1", false when unset or empty.
 * @throws on any other value: silently ignoring it would leave a daemon that stops on idle while the caller believes it
 *   cannot.
 */
export function resolveIdleStopDisabled(env: NodeJS.ProcessEnv): boolean {
	const raw = env[NO_IDLE_STOP_ENV];
	if (raw === undefined || raw === '') {
		return false;
	}
	if (raw !== '1') {
		throw new Error(
			`${NO_IDLE_STOP_ENV}="${raw}" is not valid: set it to "1" to keep the daemon alive when idle, or unset it (or leave it empty) for the default.`
		);
	}
	return true;
}
