/** Environment variable that moves the daemon's command server off the standard port range. */
export const DAEMON_PORT_ENV = 'FLOW_DAEMON_PORT';

/**
 * The port the daemon's command server starts from, when the environment overrides it.
 *
 * Without the variable the daemon uses the standard range, which is how clients find a user's daemon. Zero asks the OS
 * for a free port. Meant for tests and embedders that must not compete with a real daemon for the standard range.
 *
 * @returns the port, or undefined when the standard one applies.
 * @throws when the variable is set to anything but an integer from 0 to 65535, because silently using the
 *   standard range would defeat the isolation the caller asked for.
 */
export function resolveDaemonPort(env: NodeJS.ProcessEnv): number | undefined {
	const raw = env[DAEMON_PORT_ENV];
	if (raw === undefined || raw === '') {
		return undefined;
	}
	if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) {
		throw new Error(
			`${DAEMON_PORT_ENV}="${raw}" is not a valid port: use an integer from 0 to 65535 (0 lets the OS pick a free port), or unset it to use the standard range.`
		);
	}
	return Number(raw);
}
