// Test helper: builds an environment in which a spawned flow CLI / updater cannot reach the real
// machine state (config dir, global npm, user npm config, home directory).
//
// Incident 2026-10-25: integration tests ran the repo-built bundle's `cli update` against the real
// config dir and the real global npm; the `npm install -g` was killed halfway and the global CLI
// vanished. Every spawned CLI or updater in a test must use this env.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Nothing listens on the discard port: any npm network access fails fast instead of installing. */
export const UNREACHABLE_REGISTRY = 'http://127.0.0.1:9';

// Variables that steer the updater / launcher / npm / home lookup: a leaked one from the parent shell
// must not change a test, and the real values must never reach the child. Case-insensitive because
// Windows env names are, while JS object keys are not.
const STRIPPED =
	/^(FLOW_QUEUE_EVENTS$|UPDATER_|LAUNCHER_|CLI_SELF_CHECK|NPM_CONFIG_|FLOW_CONFIG_DIR$|XDG_CONFIG_HOME$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$|TMPDIR$)/i;

export interface IsolatedCliEnv {
	/** Root of the throwaway tree (config, home, npm prefix, npm cache). */
	root: string;
	/** Value of FLOW_CONFIG_DIR, also where ConfigDir resolves under the overridden XDG_CONFIG_HOME. */
	configDir: string;
	npmPrefix: string;
	/** Full env for spawn(): parent env minus steering vars, plus the isolation overrides and `extra`. */
	env: NodeJS.ProcessEnv;
	/** Removes the whole tree. Call from a finally / afterEach. */
	cleanup(): void;
}

/**
 * @param opts.registry registry URL for npm (default: unreachable).
 * @param opts.queueEvents true keeps the flow queue events on (FLOW_QUEUE_EVENTS=1) for the one test that checks them
 *   against a FAKE queue. Default false: FLOW_QUEUE_EVENTS=0, because a daemon that publishes would declare its events to
 *   the developer's real queue (observed: "declared to the queue (6 events)" from a test run).
 * @param opts.extra extra env entries, applied last.
 */
export function createIsolatedCliEnv(
	opts: { registry?: string; queueEvents?: boolean; extra?: NodeJS.ProcessEnv } = {}
): IsolatedCliEnv {
	const registry = opts.registry ?? UNREACHABLE_REGISTRY;
	const root = mkdtempSync(join(tmpdir(), 'flow-test-iso-'));
	const home = join(root, 'home');
	const configDir = join(home, '.config', 'flow');
	const npmPrefix = join(root, 'npm-prefix');
	const npmCache = join(root, 'npm-cache');
	// os.tmpdir() of the spawned CLI (Windows: TEMP/TMP, elsewhere: TMPDIR): the launcher script of a daemon start goes there.
	const tempDir = join(root, 'tmp');
	for (const dir of [
		home,
		configDir,
		npmPrefix,
		npmCache,
		tempDir,
		join(home, 'AppData', 'Roaming'),
		join(home, 'AppData', 'Local'),
	]) {
		mkdirSync(dir, { recursive: true });
	}
	// Own npm config files for user AND global level (npm refuses the same file for both), so the real
	// user-level npm config (auth tokens, scope registries) is never read.
	const npmConfig = `registry=${registry}\n@wadeck-app:registry=${registry}\nfetch-retries=0\nfetch-timeout=3000\naudit=false\nfund=false\nupdate-notifier=false\n`;
	const npmUserConfig = join(root, 'npm-user.ini');
	const npmGlobalConfig = join(root, 'npm-global.ini');
	writeFileSync(npmUserConfig, npmConfig);
	writeFileSync(npmGlobalConfig, npmConfig);

	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (!STRIPPED.test(key)) {
			env[key] = value;
		}
	}
	Object.assign(
		env,
		{
			FLOW_CONFIG_DIR: configDir,
			XDG_CONFIG_HOME: join(home, '.config'),
			TEMP: tempDir,
			TMP: tempDir,
			TMPDIR: tempDir,
			HOME: home,
			USERPROFILE: home,
			APPDATA: join(home, 'AppData', 'Roaming'),
			LOCALAPPDATA: join(home, 'AppData', 'Local'),
			FLOW_QUEUE_EVENTS: opts.queueEvents === true ? '1' : '0',
			NPM_CONFIG_PREFIX: npmPrefix,
			NPM_CONFIG_CACHE: npmCache,
			NPM_CONFIG_USERCONFIG: npmUserConfig,
			NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
			NPM_CONFIG_REGISTRY: registry,
			// A project-level .npmrc naming the @wadeck-app registry outranks the userconfig file;
			// only this env variable beats it (otherwise `npm view` from a test reaches npm.pkg.github.com).
			'npm_config_@wadeck-app:registry': registry,
		},
		opts.extra
	);

	return {
		root,
		configDir,
		npmPrefix,
		env,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}
