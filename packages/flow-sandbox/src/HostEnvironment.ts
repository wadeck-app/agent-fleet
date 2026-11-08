import * as os from 'node:os';

/**
 * The real user directories a wrapper's own `sbx` and `aws` children need (the sbx login state and the AWS SSO session live
 * there), for a daemon that was started with an ISOLATED home (live checks, benchmarks, tests).
 *
 * Why not simply leave the real HOME / USERPROFILE / APPDATA / LOCALAPPDATA in the daemon's environment: the daemon would then
 * read and write the user's real flow, project and app-core state (incident 2026-11-08: a live check's daemon registered this
 * clone's app-modules with the user's app-core). The daemon gets the isolated directories; the real ones travel under the
 * `FLOW_SANDBOX_HOST_*` names, and only {@link restoreFor} puts them back, in the environment of the wrapper's own children.
 * Without these variables (production) nothing changes.
 */
export class HostEnvironment {
	/** Variable that carries the real value of each directory variable. */
	static readonly CARRIERS = {
		HOME: 'FLOW_SANDBOX_HOST_HOME',
		USERPROFILE: 'FLOW_SANDBOX_HOST_USERPROFILE',
		APPDATA: 'FLOW_SANDBOX_HOST_APPDATA',
		LOCALAPPDATA: 'FLOW_SANDBOX_HOST_LOCALAPPDATA',
	} as const;

	/**
	 * For the launching side: the carrier variables holding the REAL directories of the current process. HOME and USERPROFILE
	 * fall back to `os.homedir()`; APPDATA and LOCALAPPDATA are omitted when unset (they only exist on Windows).
	 */
	static capture(source: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): Record<string, string> {
		const captured: Record<string, string> = {
			[HostEnvironment.CARRIERS.HOME]: home,
			[HostEnvironment.CARRIERS.USERPROFILE]: source['USERPROFILE'] ?? home,
		};
		for (const name of ['APPDATA', 'LOCALAPPDATA'] as const) {
			const value = source[name];
			if (value !== undefined && value !== '') captured[HostEnvironment.CARRIERS[name]] = value;
		}
		return captured;
	}

	/**
	 * For the launching side: `env` without ANY carrier it inherited (from the parent shell, any case) plus the carriers captured now.
	 * Always build the daemon's environment through this: a stale inherited carrier would otherwise survive wherever the current
	 * process has no value to replace it (APPDATA and LOCALAPPDATA only exist on Windows). A copy; `env` is not modified.
	 */
	static isolate(
		env: NodeJS.ProcessEnv,
		source: NodeJS.ProcessEnv = process.env,
		home: string = os.homedir()
	): NodeJS.ProcessEnv {
		const carriers = new Set<string>(Object.values(HostEnvironment.CARRIERS).map(name => name.toLowerCase()));
		const kept: NodeJS.ProcessEnv = {};
		for (const [name, value] of Object.entries(env)) {
			if (!carriers.has(name.toLowerCase())) kept[name] = value;
		}
		return { ...kept, ...HostEnvironment.capture(source, home) };
	}

	/**
	 * For the wrapper's OWN children (sbx, aws): `env` with the four directory variables set to their real values, and the
	 * carriers removed. USERPROFILE falls back to the real HOME (the former single carrier). A copy; `env` is not modified.
	 */
	static restoreFor(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
		const restored: NodeJS.ProcessEnv = {};
		const carriers = new Set<string>(Object.values(HostEnvironment.CARRIERS).map(name => name.toLowerCase()));
		for (const [name, value] of Object.entries(env)) {
			if (!carriers.has(name.toLowerCase())) restored[name] = value;
		}
		const hostHome = HostEnvironment.valueOf(env, HostEnvironment.CARRIERS.HOME);
		if (hostHome !== undefined) restored['HOME'] = hostHome;
		const userProfile = HostEnvironment.valueOf(env, HostEnvironment.CARRIERS.USERPROFILE) ?? hostHome;
		if (userProfile !== undefined) restored['USERPROFILE'] = userProfile;
		for (const name of ['APPDATA', 'LOCALAPPDATA'] as const) {
			const value = HostEnvironment.valueOf(env, HostEnvironment.CARRIERS[name]);
			if (value !== undefined) restored[name] = value;
		}
		return restored;
	}

	private static valueOf(env: NodeJS.ProcessEnv, carrier: string): string | undefined {
		// Windows environment names are case-insensitive, JavaScript object keys are not.
		const entry = Object.entries(env).find(([name]) => name.toLowerCase() === carrier.toLowerCase());
		return entry?.[1] === undefined || entry[1] === '' ? undefined : entry[1];
	}
}
