/** Environment variable that changes how often the daemon checks whether it is idle. */
export const IDLE_CHECK_INTERVAL_ENV = 'FLOW_DAEMON_IDLE_CHECK_MS';

/**
 * The idle-check interval the environment asks for, in milliseconds.
 *
 * Meant for tests that run the real daemon process and cannot wait the default thirty seconds.
 *
 * @returns the interval, or undefined when the default applies.
 * @throws when the variable is set to anything but a positive integer: silently using the default would make a test
 *   that asked for a short interval wait for a long one and look hung.
 */
export function resolveIdleCheckInterval(env: NodeJS.ProcessEnv): number | undefined {
	const raw = env[IDLE_CHECK_INTERVAL_ENV];
	if (raw === undefined || raw === '') {
		return undefined;
	}
	if (!/^\d{1,9}$/.test(raw) || Number(raw) === 0) {
		throw new Error(
			`${IDLE_CHECK_INTERVAL_ENV}="${raw}" is not a valid interval: use a positive whole number of milliseconds, or unset it for the default.`
		);
	}
	return Number(raw);
}
