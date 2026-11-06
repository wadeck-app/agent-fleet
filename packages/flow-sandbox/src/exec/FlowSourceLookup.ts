import { WorkerSourceRegistry } from 'flow-cli/src/daemon/WorkerSourceRegistry';

/** What the wrapper may read about its own source. */
export interface SourceFacts {
	/** `<pluginId>.<implName>` of the source's `--plugin`, absent for a source declared with `--provider` only. */
	plugin?: string;
}

/**
 * Reads flow's own registry of worker sources (`worker-sources.json` in flow's config directory), the file
 * `flow worker source list` prints. Read-only. It is the only place the wrapper can learn whether its source was declared
 * with a plugin ref, which is what gives its workers a worker type. It sees the registry of ITS environment (same user,
 * same `XDG_CONFIG_HOME`): a daemon running with another config directory is not visible from here.
 */
export class FlowSourceLookup {
	constructor(private readonly configDirectory: string) {}

	/** The entry of the source, undefined when this registry has none. Throws, with the cause, when the file cannot be read. */
	find(sourceId: string): SourceFacts | undefined {
		return new WorkerSourceRegistry(this.configDirectory).list().find(entry => entry.sourceId === sourceId);
	}
}
