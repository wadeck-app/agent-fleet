import type { WorkerTypeInstance } from 'extension-points';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { type CommandSourceOptions, CommandWorkerSource } from './CommandWorkerSource.js';
import { PluginConfigurationError } from './PluginConfigurationError.js';

/** The type reference the command worker type is registered under (see BuiltinPluginRegistry). */
export const COMMAND_WORKER_TYPE_REF = 'plugins.command.default';

type IssueLaunchToken = (sourceId: string) => string;

/**
 * The command worker type as a worker-type instance: its source runs the declared command ({@link CommandWorkerSource}),
 * unchanged.
 *
 * No `run` hook and nothing to release: the launched worker's lifetime belongs to the source, not to the daemon (D#41).
 * `dispose` is a no-op that can be called any number of times.
 *
 * This is the single construction path: the `built-in:command` provider string and the plugin factory both end here.
 * `issueLaunchToken` is optional so a command declared with its own `--token` keeps working.
 */
export function buildCommandWorkerType(
	options: CommandSourceOptions,
	issueLaunchToken?: IssueLaunchToken,
	kind?: string
): WorkerTypeInstance {
	return {
		source: new CommandWorkerSource(options, issueLaunchToken, kind),
		dispose: () => Promise.resolve(),
	};
}

/**
 * Plugin form of the command worker type, served from the built-in registry.
 *
 * The one-shot launch credential comes from the daemon (`host.issueLaunchToken`), lent to built-ins only (see
 * WorkerTypeInstances). A missing command is reported when a worker is asked for, as for the provider string.
 *
 * **Differs from `built-in:command`:** the daemon expands `${NAME}` in every string of `options` (so in `command`,
 * `args` and `cwd`) from ITS environment before this factory runs, and the build fails when a variable is unset. The
 * provider string never did that, so `--command "echo ${HOME}"` means different things in the two forms.
 */
export const commandWorkerTypePlugin: FlowPlugin<WorkerTypeInstance> = {
	extensionPoint: 'worker-type',
	create: context => {
		try {
			const sourceId = String(context['sourceId']);
			return Promise.resolve(
				buildCommandWorkerType(
					checkedOptions(sourceId, context['options']),
					checkedHost(context['host']),
					COMMAND_PLUGIN_REF
				)
			);
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	},
};

const COMMAND_PLUGIN_REF = 'command.default';
const WIRING = ' This is a wiring mistake in the daemon, not a configuration error -- please report it.';

/** @throws when the host the daemon lent is not what this plugin was written against */
function checkedHost(host: unknown): IssueLaunchToken | undefined {
	if (host === undefined) {
		return undefined;
	}
	if (typeof host !== 'object' || host === null) {
		throw new Error(`the command worker type got a host that is not an object (${typeName(host)}).${WIRING}`);
	}
	const { issueLaunchToken } = host as { issueLaunchToken?: unknown };
	if (issueLaunchToken !== undefined && typeof issueLaunchToken !== 'function') {
		throw new Error(
			`the command worker type needs host.issueLaunchToken to be a function when given, got ${typeName(issueLaunchToken)}.${WIRING}`
		);
	}
	return issueLaunchToken as IssueLaunchToken | undefined;
}

/** @throws when the declared options have the wrong shape; absent options are fine (the missing command is reported on use) */
function checkedOptions(sourceId: string, options: unknown): CommandSourceOptions {
	const fix = ` Fix: flow worker source remove ${sourceId}, then declare it again.`;
	if (options === undefined) {
		return {};
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new PluginConfigurationError(
			`the command worker type needs its options to be an object, got ${typeName(options)}.${fix}`
		);
	}
	const { command, args, cwd } = options as Record<string, unknown>;
	for (const [name, value] of [
		['command', command],
		['cwd', cwd],
	] as const) {
		if (value !== undefined && typeof value !== 'string') {
			throw new PluginConfigurationError(
				`the command worker type needs options.${name} to be a string, got ${typeName(value)}.${fix}`
			);
		}
	}
	if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string'))) {
		throw new PluginConfigurationError(
			`the command worker type needs options.args to be an array of strings.${fix}`
		);
	}
	return options as CommandSourceOptions;
}

function typeName(value: unknown): string {
	return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
}
