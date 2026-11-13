import type { WorkerTypeInstance } from 'extension-points';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { ForkWorkerSource, type ForkWorkerSourceOptions } from './ForkWorkerSource.js';
import { PluginConfigurationError } from './PluginConfigurationError.js';

/** The type reference the fork worker type is registered under (see BuiltinPluginRegistry). */
export const FORK_WORKER_TYPE_REF = 'plugins.fork.default';

/** What the daemon lends to build its own fork fallback: the ports, the claude path, its log and its masker. */
export interface ForkWorkerInputs extends ForkWorkerSourceOptions {
	httpPort: number;
	/** Port or lazy getter -- evaluated at spawn time so an async port retry resolves first. */
	wsPort: number | (() => number);
	claudePath?: string;
}

/** The instance of the fork worker type; its source is the concrete class, whose pending/terminate API the daemon needs. */
export interface ForkWorkerTypeInstance extends WorkerTypeInstance {
	source: ForkWorkerSource;
}

/**
 * The fork worker type as a worker-type instance over the existing {@link ForkWorkerSource}, unchanged.
 *
 * `dispose` is a no-op that can be called any number of times: ending the workers still running is the stop sequence's
 * job (`ForkWorkerSource.terminateRemaining`, after the workers were asked to exit and their sockets closed), not a side
 * effect of disposing the instance. No `run` hook.
 */
export function buildForkWorkerType(inputs: ForkWorkerInputs): ForkWorkerTypeInstance {
	const { httpPort, wsPort, claudePath, log, maskText } = inputs;
	return {
		source: new ForkWorkerSource(httpPort, wsPort, claudePath, {
			...(log === undefined ? {} : { log }),
			...(maskText === undefined ? {} : { maskText }),
		}),
		dispose: () => Promise.resolve(),
	};
}

const WIRING = ' This is a wiring mistake in the daemon, not a configuration error -- please report it.';

/**
 * Plugin form of the fork worker type, served from the built-in registry.
 *
 * Fork is the daemon's own fallback, never a declared source: it is built only from `host.fork`, which the daemon alone
 * has. A declared entry names no such host, so building it for one is refused as a configuration error. It is registered
 * statically (BuiltinWorkerTypes) like the other built-ins, so the single-file bundle contains it.
 *
 * Single source of truth: the daemon does NOT call `create` (nothing sets `host.fork` in production, see
 * WorkerTypeInstances); it calls {@link buildForkWorkerType} directly through DaemonForkWorkers, and `create` calls that
 * same factory. So the two paths cannot diverge in behaviour; the plugin's own job in production is the refusal above.
 * ForkWorkerTypePlugin.test.ts asserts that both build the same worker. Routing the daemon through `create` was left
 * undone on purpose: it would make a synchronous startup step async and add a failure path for no behaviour gain.
 */
export const forkWorkerTypePlugin: FlowPlugin<WorkerTypeInstance> = {
	extensionPoint: 'worker-type',
	create: context => {
		const sourceId = String(context['sourceId']);
		const fork = (context['host'] as { fork?: unknown } | undefined)?.fork;
		if (fork === undefined) {
			return Promise.reject(
				new PluginConfigurationError(
					`the fork worker type is the daemon's own fallback and cannot be built for the declared source "${sourceId}". Fix: flow worker source remove ${sourceId}.`
				)
			);
		}
		try {
			return Promise.resolve(buildForkWorkerType(checkedInputs(fork)));
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	},
};

/** @throws when the inputs the daemon lent are not what this plugin was written against */
function checkedInputs(fork: unknown): ForkWorkerInputs {
	if (typeof fork !== 'object' || fork === null) {
		throw new Error(`the fork worker type got host.fork that is not an object (${typeof fork}).${WIRING}`);
	}
	const { httpPort, wsPort } = fork as Record<string, unknown>;
	if (typeof httpPort !== 'number') {
		throw new Error(
			`the fork worker type needs host.fork.httpPort to be a number, got ${typeof httpPort}.${WIRING}`
		);
	}
	if (typeof wsPort !== 'number' && typeof wsPort !== 'function') {
		throw new Error(
			`the fork worker type needs host.fork.wsPort to be a number or a function, got ${typeof wsPort}.${WIRING}`
		);
	}
	return fork as ForkWorkerInputs;
}
