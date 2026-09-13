/**
 * DaemonConfig -- centralised configuration management for the flow daemon.
 *
 * Source of truth for all defaults and user-overridable values.
 * User config file: `~/.config/flow/config.yml` (D#58). `~/.flow-config.yaml` is the old
 * location and is no longer read -- see {@link FlowConfigLoader.loadForDaemon}.
 *
 *   RULE: Adding a new config value requires ALL of the following steps:
 *   1. Add to FlowConfigData interface with JSDoc.
 *   2. Add to FlowConfig.DEFAULT with the default value.
 *   3. Add to FlowConfig.load() merge (spread the new section).
 *   4. Add to ~/.config/flow/config.yml (commented, showing the default) -- MANDATORY.
 *   5. Add a test in FlowConfig.test.ts covering the override.
 *
 * Skipping step 4 means the user cannot discover or override the value.
 */
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The config file the daemon used to read, kept only to warn that it no longer does. */
const LEGACY_CONFIG_FILE = '.flow-config.yaml';

/**
 * Every setting, read through a typed accessor.
 *
 * Spelled out rather than walked reflectively so the comparison stays type-checked: a setting
 * that is renamed breaks this list at compile time instead of silently dropping out of the
 * warning. A setting missing from here is only absent from that warning, never from the config.
 */
const COMPARED_SETTINGS: { path: string; read: (config: FlowConfigData) => unknown }[] = [
	{ path: 'queue.concurrency', read: config => config.queue.concurrency },
	{ path: 'logs.retainDays', read: config => config.logs.retainDays },
	{ path: 'worker.wsPort', read: config => config.worker.wsPort },
	{ path: 'worker.bindAddress', read: config => config.worker.bindAddress },
	{ path: 'worker.tls', read: config => config.worker.tls },
	{ path: 'security.allowAbsolutePaths', read: config => config.security.allowAbsolutePaths },
	{ path: 'limits.maxInjectedSteps', read: config => config.limits.maxInjectedSteps },
	{ path: 'limits.maxStepsPerExecution', read: config => config.limits.maxStepsPerExecution },
	{ path: 'workspace.retainDays', read: config => config.workspace.retainDays },
	{ path: 'workspace.maxWorkspaces', read: config => config.workspace.maxWorkspaces },
];

/**
 * Names the settings where the legacy file disagrees with the config in use.
 *
 * Compared against the *effective* config, so a legacy value that happens to match a default
 * is not reported as ignored -- it is not being ignored in any way the user would notice.
 */
function describeDifferences(legacy: FlowConfigData, inUse: FlowConfigData): string[] {
	const differences: string[] = [];
	for (const setting of COMPARED_SETTINGS) {
		const legacyValue = setting.read(legacy);
		if (JSON.stringify(legacyValue) === JSON.stringify(setting.read(inUse))) continue;
		differences.push(`${setting.path}=${JSON.stringify(legacyValue)}`);
	}
	return differences;
}

export interface FlowConfigData {
	queue: {
		/** Max concurrent step executions. Default: 1. */
		concurrency: number;
		/**
		 * Silence after which an executing step is treated as stuck, in seconds. Default: 1800.
		 *
		 * Only the daemon can notice this: a wedged worker keeps its socket open and answers pings.
		 */
		stepSilenceLimitSeconds: number;
	};
	logs: {
		/** How many days to keep execution logs. Default: 30. */
		retainDays: number;
	};
	worker: {
		/** WebSocket port for worker<->daemon communication. null = auto (httpPort+1). Default: null. */
		wsPort: number | null;
		/**
		 * Address the worker listener binds. Default: '127.0.0.1'.
		 *
		 * Anything wider makes the daemon reachable from the network and therefore requires
		 * `worker.tls`: every non-loopback connection must be encrypted, and the daemon refuses
		 * rather than warns. Binding wide without TLS is a startup error, not a silent downgrade.
		 */
		bindAddress: string;
		/**
		 * PEM certificate and key for the worker listener. Default: null (plaintext, loopback only).
		 *
		 * Paths, not inline material -- a key pasted into config is a key in version control.
		 */
		tls: { cert: string; key: string } | null;
	};
	security: {
		/** Allow flow files outside cwd / home directory. Default: false. */
		allowAbsolutePaths: boolean;
	};
	limits: {
		/** Max steps allowed per single provideSteps call. Default: 20. */
		maxInjectedSteps: number;
		/** Max total steps (initial + injected) per execution. Default: 50. */
		maxStepsPerExecution: number;
	};
	workspace: {
		/** How many days to retain workspace directories. Default: 30. */
		retainDays: number;
		/** Maximum number of workspace directories to keep. Oldest are pruned first. Default: 50. */
		maxWorkspaces: number;
	};
}

// Keep FlowConfig as a type alias for backward compatibility with callers using `type FlowConfig`.
export type FlowConfig = FlowConfigData;

export class FlowConfigLoader {
	static readonly DEFAULT: FlowConfigData = {
		queue: { concurrency: 1, stepSilenceLimitSeconds: 1800 },
		logs: { retainDays: 30 },
		worker: { wsPort: null, bindAddress: '127.0.0.1', tls: null },
		security: { allowAbsolutePaths: false },
		limits: {
			maxInjectedSteps: 20,
			maxStepsPerExecution: 50,
		},
		workspace: { retainDays: 30, maxWorkspaces: 50 },
	};

	/**
	 * Loads the daemon's config from the single location that counts (D#58).
	 *
	 * This exists because there were two. The daemon read `~/.flow-config.yaml` while
	 * `flow worker` and plugin resolution read `~/.config/flow/config.yml`, so a machine with
	 * both ran on values the user was not looking at -- one file said concurrency 14, the other
	 * said 3, and nothing said which won.
	 *
	 * The legacy file is **never** merged or adopted. It is reported, with the settings that
	 * differ spelled out, because a warning naming only the file leaves the user to diff two
	 * YAML files by eye.
	 *
	 * @param daemonDir - where `config.yml` lives, normally `ConfigDir.get('flow')`
	 * @param legacyConfigFile - the old path to check for and complain about
	 * @returns the config, plus a warning the caller must surface when one is warranted
	 */
	static loadForDaemon(
		daemonDir: string,
		// violations-suppress: shared/no-out-of-repo-path the legacy file being warned about really did live in the user's home; looking anywhere else would never find it
		legacyConfigFile: string = path.join(os.homedir(), LEGACY_CONFIG_FILE)
	): { config: FlowConfigData; legacyWarning?: string } {
		const configFile = path.join(daemonDir, 'config.yml');
		const config = FlowConfigLoader.load(configFile);
		if (!fs.existsSync(legacyConfigFile)) return { config };

		const legacy = FlowConfigLoader.load(legacyConfigFile);
		const differences = describeDifferences(legacy, config);
		const detail =
			differences.length === 0
				? 'Its values match the ones in use, so nothing is being ignored right now.'
				: `These settings in it are being ignored: ${differences.join(', ')}.`;

		return {
			config,
			legacyWarning:
				`"${legacyConfigFile}" is no longer read. The daemon's config is "${configFile}". ${detail} ` +
				`Move anything you still want into that file and delete the old one.`,
		};
	}

	/**
	 * Load and merge user config from the given YAML file with the default config.
	 * Unknown keys are ignored; missing keys fall back to defaults.
	 */
	static load(configFile: string): FlowConfigData {
		if (!fs.existsSync(configFile)) return FlowConfigLoader.DEFAULT;
		try {
			const loaded = yaml.load(fs.readFileSync(configFile, 'utf8'), {
				schema: yaml.JSON_SCHEMA,
			}) as Partial<FlowConfigData>;
			return {
				queue: { ...FlowConfigLoader.DEFAULT.queue, ...loaded?.queue },
				logs: { ...FlowConfigLoader.DEFAULT.logs, ...loaded?.logs },
				worker: { ...FlowConfigLoader.DEFAULT.worker, ...loaded?.worker },
				security: { ...FlowConfigLoader.DEFAULT.security, ...loaded?.security },
				limits: { ...FlowConfigLoader.DEFAULT.limits, ...loaded?.limits },
				workspace: { ...FlowConfigLoader.DEFAULT.workspace, ...loaded?.workspace },
			};
		} catch {
			process.stderr.write('Warning: daemon config could not be parsed, using defaults.\n');
			return FlowConfigLoader.DEFAULT;
		}
	}
}
