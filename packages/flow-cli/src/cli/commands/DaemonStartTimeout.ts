/** Hard cap on how long a command waits for a daemon it started; the only place this variable is read. */
export const DAEMON_START_TIMEOUT_ENV = 'FLOW_DAEMON_START_TIMEOUT_MS';

/**
 * Generous on purpose: a daemon that is alive and still starting is never given up on before this. A daemon that is gone
 * (or never showed itself) is reported at once or after the short grace, so this is only the bound for "alive but stuck".
 */
export const DAEMON_START_CAP_DEFAULT_MS = 60_000;

/**
 * @returns the cap in milliseconds: {@link DAEMON_START_TIMEOUT_ENV} when set, else {@link DAEMON_START_CAP_DEFAULT_MS}.
 * @throws when the variable is set to anything but a positive whole number: a typo must not silently fall back to the default.
 */
export function resolveDaemonStartCapMs(env: NodeJS.ProcessEnv = process.env): number {
	const raw = env[DAEMON_START_TIMEOUT_ENV];
	if (raw === undefined || raw === '') {
		return DAEMON_START_CAP_DEFAULT_MS;
	}
	if (!/^[0-9]+$/.test(raw) || Number(raw) <= 0) {
		throw new Error(
			`${DAEMON_START_TIMEOUT_ENV}=${JSON.stringify(raw)} is not valid: expected a positive whole number of milliseconds ` +
				`(for example ${DAEMON_START_TIMEOUT_ENV}=120000), or unset it to use the default of ${String(DAEMON_START_CAP_DEFAULT_MS)} ms.`
		);
	}
	return Number(raw);
}
