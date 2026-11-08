import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The standard port range a user's own flow daemon uses (`flow --help`: FLOW_DAEMON_PORT). */
const STANDARD_DAEMON_PORTS = { from: 47_823, to: 47_833 };
/** The port app-core listens on when nothing else is configured (app-core SDK). */
const DEFAULT_APP_CORE_PORT = 4850;

export interface DaemonIsolationCheck {
	/** The environment the flow daemon is about to be started with. */
	env: NodeJS.ProcessEnv;
	/** The throw-away tree everything of the daemon must live under. */
	isolatedRoot: string;
	/** The real user home. Default: `os.homedir()`. */
	realHome?: string;
}

/**
 * Refuses to start a flow daemon (live checks, benchmarks, end-to-end tests) in an environment that can reach the user's real
 * flow, project or app-core state, or the standard daemon port range of the user's own daemon.
 *
 * Incident 2026-11-08: live checks gave the daemon the real HOME/USERPROFILE/APPDATA/LOCALAPPDATA (so that the wrapper could
 * reach the sbx login and the AWS SSO session), and a daemon of a source checkout registered this clone's app-modules with the
 * user's real app-core. The real directories must travel in FLOW_SANDBOX_HOST_* (HostEnvironment) and come back only for the
 * wrapper's own sbx/aws children.
 */
export class DaemonIsolationGuard {
	/** What is wrong with the environment; empty when the daemon may start. */
	static problems(check: DaemonIsolationCheck): string[] {
		const { env, isolatedRoot } = check;
		const realHome = check.realHome ?? os.homedir();
		const problems: string[] = [];

		for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'FLOW_CONFIG_DIR', 'XDG_CONFIG_HOME']) {
			const problem = DaemonIsolationGuard.underRoot(name, env[name], isolatedRoot);
			if (problem !== undefined) problems.push(problem);
		}

		const appCoreDirectory = env['APP_CORE_CONFIG_DIR'];
		const appCoreProblem = DaemonIsolationGuard.underRoot('APP_CORE_CONFIG_DIR', appCoreDirectory, isolatedRoot);
		if (appCoreProblem !== undefined) {
			problems.push(appCoreProblem);
		} else if (appCoreDirectory !== undefined && fs.existsSync(appCoreDirectory)) {
			problems.push(
				`APP_CORE_CONFIG_DIR ${appCoreDirectory} exists: the app-core SDK writes a pickup file into an EXISTING app-core config directory. Leave it absent.`
			);
		}
		if (
			appCoreDirectory !== undefined &&
			DaemonIsolationGuard.same(appCoreDirectory, path.join(realHome, '.config', 'app-core'))
		) {
			problems.push(`APP_CORE_CONFIG_DIR is the real ${path.join(realHome, '.config', 'app-core')}.`);
		}

		problems.push(...DaemonIsolationGuard.appCorePortProblems(env['APP_CORE_PORT'], realHome));
		problems.push(...DaemonIsolationGuard.daemonPortProblems(env['FLOW_DAEMON_PORT']));
		return problems;
	}

	/** @throws an Error naming every problem and the fix, when the daemon must not start. */
	static assert(check: DaemonIsolationCheck): void {
		const problems = DaemonIsolationGuard.problems(check);
		if (problems.length === 0) return;
		throw new Error(
			`Refusing to start a flow daemon: its environment can reach the real user state.\n- ${problems.join('\n- ')}\n` +
				'Build the environment with createIsolatedCliEnv() (flow-cli test-utils) and do not override HOME, USERPROFILE, APPDATA, ' +
				'LOCALAPPDATA or APP_CORE_*; pass the real directories to the wrapper with HostEnvironment.capture() (FLOW_SANDBOX_HOST_*); ' +
				'set FLOW_DAEMON_PORT=0.'
		);
	}

	private static appCorePortProblems(raw: string | undefined, realHome: string): string[] {
		if (raw === undefined || raw === '') {
			return [
				`APP_CORE_PORT is not set: the SDK would use the port of the real app-core (${DEFAULT_APP_CORE_PORT} or its server.port.json). Set it to a dead port (DEAD_APP_CORE_PORT of createIsolatedCliEnv).`,
			];
		}
		const port = Number(raw);
		if (!/^\d{1,5}$/.test(raw) || port < 1 || port > 65_535) return [`APP_CORE_PORT "${raw}" is not a port.`];
		if (port === DEFAULT_APP_CORE_PORT)
			return [`APP_CORE_PORT is ${DEFAULT_APP_CORE_PORT}, the port of the real app-core.`];
		const realPortFile = path.join(realHome, '.config', 'app-core', 'server.port.json');
		try {
			const real = (JSON.parse(fs.readFileSync(realPortFile, 'utf8')) as { port?: unknown }).port;
			if (real === port)
				return [`APP_CORE_PORT is ${port}, the port the real app-core recorded in ${realPortFile}.`];
		} catch {
			// No readable port file: the real app-core is not recorded there, nothing to compare with.
		}
		return [];
	}

	private static daemonPortProblems(raw: string | undefined): string[] {
		if (raw === undefined || raw === '') {
			return [
				`FLOW_DAEMON_PORT is not set: the daemon would use the standard range ${STANDARD_DAEMON_PORTS.from}-${STANDARD_DAEMON_PORTS.to}, where the user's own daemon runs. Set it to 0.`,
			];
		}
		const port = Number(raw);
		if (!/^\d{1,5}$/.test(raw) || port > 65_535) return [`FLOW_DAEMON_PORT "${raw}" is not a port.`];
		if (port >= STANDARD_DAEMON_PORTS.from && port <= STANDARD_DAEMON_PORTS.to) {
			return [`FLOW_DAEMON_PORT ${port} is in the standard range of the user's own daemon. Set it to 0.`];
		}
		return [];
	}

	private static underRoot(name: string, value: string | undefined, root: string): string | undefined {
		if (value === undefined || value === '') {
			return `${name} is not set: the daemon would fall back to the real user directory.`;
		}
		const relative = path.relative(DaemonIsolationGuard.normalize(root), DaemonIsolationGuard.normalize(value));
		if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			return `${name} is ${value}, outside the isolated root ${root}.`;
		}
		return undefined;
	}

	private static same(left: string, right: string): boolean {
		return DaemonIsolationGuard.normalize(left) === DaemonIsolationGuard.normalize(right);
	}

	/**
	 * The real path of the longest existing ancestor plus the rest, so a short 8.3 name or a link and its target compare equal
	 * even when the directory itself does not exist (the app-core one must not).
	 */
	private static normalize(value: string): string {
		const missing: string[] = [];
		let existing = path.resolve(value);
		while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
			missing.unshift(path.basename(existing));
			existing = path.dirname(existing);
		}
		const resolved = path.join(fs.existsSync(existing) ? fs.realpathSync.native(existing) : existing, ...missing);
		return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
	}
}
