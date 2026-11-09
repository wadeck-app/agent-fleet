import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

interface Read {
	/** What the declaration was read from: another plugin or directory for the same source means read again. */
	key: string;
	declared: string[];
	/** The workspace kinds the source accepts; undefined: no restriction. */
	workspaces: string[] | undefined;
}

/**
 * The guarantees the declared worker sources MAY provide, from the static declaration of their plugin manifests.
 *
 * It answers two questions the router cannot, because they are about workers that do not exist yet: which requirements
 * can a flow name at all, and which source to ask for a worker when a step waits for one. Who actually guarantees what
 * at routing time is the BUILT instance (see `WorkerTypeInstances.guaranteesOf`), a subset of this.
 *
 * Reading a manifest is asynchronous, routing is not: {@link refresh} reads the declarations (once per source and
 * plugin, retried while it fails), and the other methods answer from what was read. A source never read is reported by
 * {@link unread}, so a caller can tell "nobody provides it" from "not known yet".
 */
export class DeclaredGuarantees {
	private readonly read = new Map<string, Read>();

	/**
	 * @param sources the declared worker sources
	 * @param reader reads the static declaration of one source's plugin (`WorkerTypeInstances.declaredGuarantees`, and
	 *        `declaredWorkspaces` for the workspace kinds it accepts: a reader without it declares no restriction)
	 * @param log told, with the fix, of each source whose declaration cannot be read
	 */
	constructor(
		private readonly sources: { list(): WorkerSourceEntry[] },
		private readonly reader: {
			declaredGuarantees(entry: WorkerSourceEntry): Promise<string[]>;
			declaredWorkspaces?(entry: WorkerSourceEntry): Promise<string[] | undefined>;
		},
		private readonly log: (message: string) => void
	) {}

	/** Reads the declarations not read yet. Never throws: a source that cannot be read is logged and stays {@link unread}. */
	async refresh(): Promise<void> {
		await Promise.all(
			this.pluginSources().map(async entry => {
				const key = keyOf(entry);
				if (this.read.get(entry.sourceId)?.key === key) {
					return;
				}
				try {
					// Both or none: a source whose workspace kinds cannot be read must not look unrestricted.
					const declared = await this.reader.declaredGuarantees(entry);
					const workspaces = await this.reader.declaredWorkspaces?.(entry);
					this.read.set(entry.sourceId, { key, declared, workspaces });
				} catch (err) {
					this.read.delete(entry.sourceId);
					this.log(
						`${(err as Error).message} Requirements this source could provide are unknown until it is fixed.`
					);
				}
			})
		);
	}

	/** Every entry some declared source may provide, each once, sorted. */
	entries(): string[] {
		return [...new Set(this.currentReads().flatMap(({ read }) => read.declared))].sort();
	}

	/** The declared sources that may provide this entry. */
	providersOf(entry: string): string[] {
		return this.currentReads()
			.filter(({ read }) => read.declared.includes(entry))
			.map(({ sourceId }) => sourceId);
	}

	/** The declared sources that may provide EVERY entry (a step runs on one worker, so one source has to vouch for all of them). */
	providersOfAll(required: readonly string[]): string[] {
		return this.shortfalls(required)
			.filter(({ missing }) => missing.length === 0)
			.map(({ sourceId }) => sourceId);
	}

	/** What each declared source lacks of the set, the ones lacking the least first (then by id): for a failure message. */
	shortfalls(required: readonly string[]): { sourceId: string; missing: string[] }[] {
		return this.currentReads()
			.map(({ sourceId, read }) => ({
				sourceId,
				missing: required.filter(entry => !read.declared.includes(entry)),
			}))
			.sort((a, b) => a.missing.length - b.missing.length || a.sourceId.localeCompare(b.sourceId));
	}

	/**
	 * What the manifest of one declared source guarantees, sorted. Undefined when it is not known (not a plugin source, not
	 * declared, not read yet, or unreadable): never an empty list, which means "this plugin declares none".
	 */
	guaranteesOf(sourceId: string): string[] | undefined {
		const declared = this.currentReads().find(read => read.sourceId === sourceId)?.read.declared;
		return declared === undefined ? undefined : [...declared].sort();
	}

	/** The workspace kinds the declared source accepts, from its manifest; undefined: no restriction (or the source is not known). */
	workspacesOf(sourceId: string): string[] | undefined {
		return this.currentReads().find(read => read.sourceId === sourceId)?.read.workspaces;
	}

	/**
	 * Whether the source may serve a run whose workspace is of this kind. A source without a restriction accepts any
	 * kind; a restricted one never accepts a kind that is unknown (undefined), nor one it does not list.
	 */
	acceptsWorkspace(sourceId: string, kind: string | undefined): boolean {
		const accepted = this.workspacesOf(sourceId);
		return accepted === undefined || (kind !== undefined && accepted.includes(kind));
	}

	/** The plugin sources whose declaration is not known (not read yet, or unreadable). */
	unread(): string[] {
		const known = new Set(this.currentReads().map(({ sourceId }) => sourceId));
		return this.pluginSources()
			.map(entry => entry.sourceId)
			.filter(sourceId => !known.has(sourceId));
	}

	private pluginSources(): WorkerSourceEntry[] {
		return this.sources.list().filter(entry => entry.plugin !== undefined);
	}

	/** The reads that still describe a declared source (one removed, or declared again with another plugin, no longer counts). */
	private currentReads(): { sourceId: string; read: Read }[] {
		return this.pluginSources().flatMap(entry => {
			const read = this.read.get(entry.sourceId);
			return read?.key === keyOf(entry) ? [{ sourceId: entry.sourceId, read }] : [];
		});
	}
}

function keyOf(entry: WorkerSourceEntry): string {
	return JSON.stringify([entry.plugin, entry.pluginsDir]);
}
