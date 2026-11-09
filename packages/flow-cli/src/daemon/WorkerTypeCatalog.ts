import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** Answers "what do the workers of this source guarantee": nothing for a worker of no source, or of one no longer declared. */
export type GuaranteeLookup = (sourceId: string | undefined) => string[];

/**
 * Answers "which workspace provider kinds do the workers of this source accept": undefined for no restriction (also for a
 * worker of no source), an empty list for a source no longer declared or not built.
 */
export type WorkspaceKindsLookup = (sourceId: string | undefined) => readonly string[] | undefined;

/** Answers "are the workers of this source requirement-only": they serve only steps whose requirements the source guarantees. */
export type RequirementOnlyLookup = (sourceId: string | undefined) => boolean;

/**
 * What the declared sources say about their workers: which are requirement-only, what they guarantee, which workspace kinds
 * they accept.
 *
 * Authority: a worker's `sourceId` is proven by that source's credential when the connection is admitted, and
 * `WorkerProvisioner.registerWorker` pins it for the life of the connection (a later `ready` naming another source,
 * or none, is refused). What is derived from it is therefore as trustworthy as the admission check. A worker that names
 * no source, or one that is not declared, is a host worker: it guarantees nothing.
 */
export class WorkerTypeCatalog {
	/**
	 * @param exclusivity says whether a declared source is requirement-only (see `WorkerTypeInstances.isRequirementOnly`,
	 *        which is fail-closed). Required: a catalog without it would make every source routable by steps that require
	 *        nothing.
	 */
	constructor(
		private readonly sources: { list(): WorkerSourceEntry[] },
		private readonly exclusivity: { isRequirementOnly(entry: WorkerSourceEntry): boolean },
		/**
		 * where the guarantees of a declared source come from (see `WorkerTypeInstances.guaranteesOf`, which is fail-closed).
		 * Absent, no source guarantees anything: a requirement can then never be met, which is the safe answer to a missing wiring.
		 */
		private readonly guarantees?: {
			guaranteesOf(entry: WorkerSourceEntry): string[];
			/** The workspace kinds the built instance of the source accepts (undefined: no restriction). Absent: no source is restricted. */
			workspacesOf?(entry: WorkerSourceEntry): string[] | undefined;
		}
	) {}

	/**
	 * Answers "are the workers of this source requirement-only", over the sources as declared right now (one read). False
	 * for a worker with no source and for a source that is no longer declared: nothing declares anything about it any more
	 * (a documented limit, see WORKERS.md).
	 */
	requirementOnlyLookup(): RequirementOnlyLookup {
		const exclusiveSources = new Set<string>();
		for (const entry of this.sources.list()) {
			if (this.exclusivity.isRequirementOnly(entry)) {
				exclusiveSources.add(entry.sourceId);
			}
		}
		return sourceId => sourceId !== undefined && exclusiveSources.has(sourceId);
	}

	/**
	 * What the workers of each source declared right now guarantee, from the source's built instance and never from a
	 * worker's own labels. One read per call, like {@link requirementOnlyLookup}. Nothing for a worker with no source, for a source
	 * no longer declared, and for any source when the catalog has no guarantee source.
	 */
	guaranteeLookup(): GuaranteeLookup {
		const guaranteesOfSource = new Map<string, string[]>();
		for (const entry of this.sources.list()) {
			guaranteesOfSource.set(entry.sourceId, this.guarantees?.guaranteesOf(entry) ?? []);
		}
		return sourceId => (sourceId === undefined ? [] : (guaranteesOfSource.get(sourceId) ?? []));
	}

	/**
	 * The workspace provider kinds each declared source accepts, from its built instance (fail-closed until it is built).
	 * Same reading rules as {@link guaranteeLookup}.
	 */
	workspaceLookup(): WorkspaceKindsLookup {
		const kindsOfSource = new Map<string, readonly string[] | undefined>();
		for (const entry of this.sources.list()) {
			kindsOfSource.set(entry.sourceId, this.guarantees?.workspacesOf?.(entry));
		}
		return sourceId =>
			sourceId === undefined ? undefined : kindsOfSource.has(sourceId) ? kindsOfSource.get(sourceId) : [];
	}
}
