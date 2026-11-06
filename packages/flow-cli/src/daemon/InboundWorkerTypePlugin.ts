import type { WorkerTypeInstance } from 'extension-points';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { InboundWorkerSource } from './InboundWorkerSource.js';

/** The type reference the inbound worker type is registered under (see BuiltinPluginRegistry). */
export const INBOUND_WORKER_TYPE_REF = 'plugins.inbound.default';

/**
 * The inbound worker type as a worker-type instance: its source nudges a worker that is already running
 * ({@link InboundWorkerSource}), unchanged. Without a `nudgeUrl` it does nothing: the worker dials in by itself.
 *
 * No `run` hook and nothing to release. `dispose` is a no-op that can be called any number of times.
 *
 * This is the single construction path: the `built-in:inbound` provider string and the plugin factory both end here.
 */
export function buildInboundWorkerType(nudgeUrl?: string): WorkerTypeInstance {
	return {
		source: new InboundWorkerSource(nudgeUrl),
		dispose: () => Promise.resolve(),
	};
}

/**
 * Plugin form of the inbound worker type, served from the built-in registry.
 *
 * Its only input is `options.nudgeUrl`. The entry's own top-level `nudgeUrl` (which workers write about themselves)
 * is copied into the options by WorkerTypeInstances, so the plugin never sees the entry.
 */
export const inboundWorkerTypePlugin: FlowPlugin<WorkerTypeInstance> = {
	extensionPoint: 'worker-type',
	create: context => {
		const sourceId = String(context['sourceId']);
		const options: unknown = context['options'] ?? {};
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			return Promise.reject(
				new Error(
					`the inbound worker type needs its options to be an object, got ${Array.isArray(options) ? 'array' : options === null ? 'null' : typeof options}.`
				)
			);
		}
		const { nudgeUrl } = options as { nudgeUrl?: unknown };
		if (nudgeUrl !== undefined && typeof nudgeUrl !== 'string') {
			return Promise.reject(
				new Error(
					`the inbound worker type needs options.nudgeUrl to be a string (an http(s) URL), got ${typeof nudgeUrl}. ` +
						`Fix: flow worker source remove ${sourceId}, then declare it again with a URL.`
				)
			);
		}
		return Promise.resolve(buildInboundWorkerType(nudgeUrl));
	},
};
