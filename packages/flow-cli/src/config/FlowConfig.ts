/**
 * DaemonConfig -- centralised configuration management for the flow daemon.
 *
 * Source of truth for all defaults and user-overridable values.
 * User config file: ~/.flow-config.yaml
 *
 *   RULE: Adding a new config value requires ALL of the following steps:
 *   1. Add to FlowConfigData interface with JSDoc.
 *   2. Add to FlowConfig.DEFAULT with the default value.
 *   3. Add to FlowConfig.load() merge (spread the new section).
 *   4. Add to ~/.flow-config.yaml (commented, showing the default) -- MANDATORY.
 *   5. Add a test in FlowConfig.test.ts covering the override.
 *
 * Skipping step 4 means the user cannot discover or override the value.
 */
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

export interface FlowConfigData {
	queue: {
		/** Max concurrent step executions. Default: 1. */
		concurrency: number;
	};
	logs: {
		/** How many days to keep execution logs. Default: 30. */
		retainDays: number;
	};
	worker: {
		/** WebSocket port for worker↔daemon communication. null = auto (httpPort+1). Default: null. */
		wsPort: number | null;
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
		queue: { concurrency: 1 },
		logs: { retainDays: 30 },
		worker: { wsPort: null },
		security: { allowAbsolutePaths: false },
		limits: {
			maxInjectedSteps: 20,
			maxStepsPerExecution: 50,
		},
		workspace: { retainDays: 30, maxWorkspaces: 50 },
	};

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
