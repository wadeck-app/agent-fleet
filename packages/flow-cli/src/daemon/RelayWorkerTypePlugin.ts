import type { WorkerTypeInstance } from 'extension-points';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import type { RegisteredRelay } from './RelayRegistry.js';
import { RelayWorkerSource } from './RelayWorkerSource.js';

/** The type reference the relay worker type is registered under (see BuiltinPluginRegistry). */
export const RELAY_WORKER_TYPE_REF = 'plugins.relay.default';

type FindRelay = (sourceId: string) => RegisteredRelay | undefined;

/**
 * The relay worker type as a worker-type instance: its source asks a connected relay for a worker
 * ({@link RelayWorkerSource}), unchanged.
 *
 * No `run` hook: a relay creates workers on its own machine and holds nothing the daemon must release after a run.
 * `dispose` is a no-op that can be called any number of times: the daemon's connection to the relay belongs to the
 * relay registry, not to this instance.
 *
 * This is the single construction path: the `built-in:relay` provider string and the plugin factory both end here,
 * so a source declared either way behaves identically.
 */
export function buildRelayWorkerType(findRelay: FindRelay): WorkerTypeInstance {
	return {
		source: new RelayWorkerSource(findRelay),
		dispose: () => Promise.resolve(),
	};
}

/**
 * Plugin form of the relay worker type, served from the built-in registry.
 *
 * It needs a daemon service the worker-type contract does not carry, the lookup of live relay connections. The daemon
 * lends it as `host.findRelay`, to built-ins only (see WorkerTypeInstances), so third-party code never receives a socket.
 */
export const relayWorkerTypePlugin: FlowPlugin<WorkerTypeInstance> = {
	extensionPoint: 'worker-type',
	create: options => {
		const host = options['host'] as { findRelay?: FindRelay } | undefined;
		if (typeof host?.findRelay !== 'function') {
			return Promise.reject(
				new Error(
					`the relay worker type needs the daemon's relay lookup (host.findRelay), which was not supplied. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
				)
			);
		}
		return Promise.resolve(buildRelayWorkerType(host.findRelay));
	},
};
