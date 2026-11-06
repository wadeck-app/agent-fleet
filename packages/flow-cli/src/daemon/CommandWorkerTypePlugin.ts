import type { WorkerTypeInstance } from 'extension-points';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { type CommandSourceOptions, CommandWorkerSource } from './CommandWorkerSource.js';

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
	issueLaunchToken?: IssueLaunchToken
): WorkerTypeInstance {
	return {
		source: new CommandWorkerSource(options, issueLaunchToken),
		dispose: () => Promise.resolve(),
	};
}

/**
 * Plugin form of the command worker type, served from the built-in registry.
 *
 * The one-shot launch credential comes from the daemon (`host.issueLaunchToken`), lent to built-ins only (see
 * WorkerTypeInstances). `options` are the source entry's, unvalidated as for the provider string: a missing command
 * is reported when a worker is asked for.
 */
export const commandWorkerTypePlugin: FlowPlugin<WorkerTypeInstance> = {
	extensionPoint: 'worker-type',
	create: context => {
		const host = context['host'] as { issueLaunchToken?: IssueLaunchToken } | undefined;
		const options = (context['options'] ?? {}) as CommandSourceOptions;
		return Promise.resolve(buildCommandWorkerType(options, host?.issueLaunchToken));
	},
};
