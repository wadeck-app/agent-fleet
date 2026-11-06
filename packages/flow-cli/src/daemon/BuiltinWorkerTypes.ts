import { getBuiltinPlugin, registerBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import type { FlowPlugin } from '../config/FlowPlugin.js';
import { COMMAND_WORKER_TYPE_REF, commandWorkerTypePlugin } from './CommandWorkerTypePlugin.js';
import { INBOUND_WORKER_TYPE_REF, inboundWorkerTypePlugin } from './InboundWorkerTypePlugin.js';
import { RELAY_WORKER_TYPE_REF, relayWorkerTypePlugin } from './RelayWorkerTypePlugin.js';

/** Registers the worker types that ship with flow. Statically referenced, so the single-file bundle contains them. Idempotent. */
export function registerBuiltinWorkerTypes(): void {
	registerBuiltinPlugin(RELAY_WORKER_TYPE_REF, relayWorkerTypePlugin);
	registerBuiltinPlugin(COMMAND_WORKER_TYPE_REF, commandWorkerTypePlugin);
	registerBuiltinPlugin(INBOUND_WORKER_TYPE_REF, inboundWorkerTypePlugin);
}

/**
 * The built-in worker type registered under a type reference ("plugins.<id>.<impl>"), if any.
 *
 * Registers the built-ins first, so the daemon and the CLI commands (which never start a daemon) both see them
 * without a registration call of their own at startup.
 */
export function findBuiltinWorkerType(typeRef: string): FlowPlugin | undefined {
	registerBuiltinWorkerTypes();
	return getBuiltinPlugin(typeRef);
}
