/** What a plugin factory builds. `dispose` releases whatever the instance holds; the owner calls it once. */
export interface FlowPluginInstance {
	dispose: () => Promise<void>;
}

/**
 * Contract of a plugin registered in the plugin registry (see PluginRegistry). Flow's own: it is copied from the
 * design of queue's relay plugins but, unlike them, has a lifecycle -- an async factory returning an instance with
 * `dispose`. The contract lives here, the registry and the module loader are generic over it.
 */
export interface FlowPlugin<TInstance extends FlowPluginInstance = FlowPluginInstance> {
	/** Extension point the instances serve (e.g. "worker-type"). */
	extensionPoint: string;
	/** Builds one instance from the options of the configured implementation. */
	create: (options: Record<string, unknown>) => Promise<TInstance>;
}

export const FLOW_PLUGIN_SHAPE = '{ extensionPoint: string, create: function }';

export function isFlowPlugin(value: unknown): value is FlowPlugin {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<FlowPlugin>;
	return (
		typeof candidate.extensionPoint === 'string' &&
		candidate.extensionPoint !== '' &&
		typeof candidate.create === 'function'
	);
}
