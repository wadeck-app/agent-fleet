import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** Answers "which type is the worker that came from this source": undefined for a worker of no type. */
export type WorkerTypeLookup = (sourceId: string | undefined) => string | undefined;

/**
 * The worker types the declared sources stand for.
 *
 * A **worker type** is the plugin id of a source's `plugin` ref (`<pluginId>.<implName>`): a source declared with
 * `--plugin sandbox.docker` produces workers of type `sandbox`, and so does one declared with `sandbox.podman`. A source
 * with no plugin (every built-in provider) has no type, and neither has a worker that names no source or one that is
 * not declared: such a worker is a host worker, never of a type.
 *
 * Authority: a worker's `sourceId` is proven by that source's credential when the connection is admitted, and
 * `WorkerProvisioner.registerWorker` pins it for the life of the connection (a later `ready` naming another source,
 * or none, is refused). The type derived from it is therefore as trustworthy as the admission check.
 */
export class WorkerTypeCatalog {
	constructor(private readonly sources: { list(): WorkerSourceEntry[] }) {}

	/**
	 * A lookup over the sources as declared right now. Read once per call, so a routing pass answers consistently and
	 * pays for one read of the registry however many workers it asks about.
	 */
	typeLookup(): WorkerTypeLookup {
		const typeOfSource = new Map<string, string>();
		for (const entry of this.sources.list()) {
			const type = typeOfEntry(entry);
			if (type !== undefined) {
				typeOfSource.set(entry.sourceId, type);
			}
		}
		return sourceId => (sourceId === undefined ? undefined : typeOfSource.get(sourceId));
	}

	/** The types some declared source stands for, each once, sorted. */
	knownTypes(): string[] {
		const types = new Set<string>();
		for (const entry of this.sources.list()) {
			const type = typeOfEntry(entry);
			if (type !== undefined) {
				types.add(type);
			}
		}
		return [...types].sort();
	}
}

function typeOfEntry(entry: WorkerSourceEntry): string | undefined {
	if (entry.plugin === undefined) {
		return undefined;
	}
	// The ref was validated at declaration (PLUGIN_REF): exactly one dot, plain names on both sides.
	return entry.plugin.split('.')[0];
}
