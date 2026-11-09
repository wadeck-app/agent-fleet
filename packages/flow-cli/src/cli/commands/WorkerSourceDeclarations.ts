// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { PluginLoader } from '../../config/PluginLoader.js';
import { DeclaredGuarantees } from '../../daemon/DeclaredGuarantees.js';
import type { WorkerSourceEntry, WorkerSourceRegistry } from '../../daemon/WorkerSourceRegistry.js';
import { WorkerTypeInstances } from '../../daemon/WorkerTypeInstances.js';

// violations-suppress-end: ts/no-deep-relative

/** What `flow worker source list` shows about one source, from the static declaration of its plugin manifest. */
export interface SourceDeclaration {
	/** Sorted; `[]` for a source that declares none (also a source without a plugin); `null` when the manifest cannot be read. */
	guarantees: string[] | null;
	/** The workspace kinds the source accepts; absent: no restriction (or unknown). */
	workspaces?: string[];
	/** A source declaring a non-empty `guarantees` list is routed only steps that require something (see WORKERS.md). */
	requirementOnly: boolean;
}

/**
 * The declarations of the plugin manifests of the declared worker sources, read as the daemon reads them at run start
 * (same reader, same bounded wait), so the listing shows exactly what a requirement is checked against. Offline: no daemon
 * is contacted and no worker is built; only the manifest of each plugin is loaded.
 */
export class WorkerSourceDeclarations {
	private constructor(private readonly declared: DeclaredGuarantees) {}

	/**
	 * Reads every declaration. A manifest that cannot be read is reported on stderr (its message names the source, the
	 * plugin and the fix) and shown as unreadable; it never fails the listing.
	 */
	static async read(registry: WorkerSourceRegistry): Promise<WorkerSourceDeclarations> {
		const declared = new DeclaredGuarantees(
			registry,
			new WorkerTypeInstances(new PluginLoader(), () => {}),
			message => {
				console.error(`[warn] ${message}`);
			}
		);
		await declared.refresh();
		return new WorkerSourceDeclarations(declared);
	}

	/** The fields `--json` adds to the entry. */
	describe(entry: WorkerSourceEntry): SourceDeclaration {
		if (entry.plugin === undefined) {
			return { guarantees: [], requirementOnly: false };
		}
		const guarantees = this.declared.guaranteesOf(entry.sourceId) ?? null;
		const workspaces = this.declared.workspacesOf(entry.sourceId);
		return {
			guarantees,
			...(workspaces === undefined ? {} : { workspaces }),
			requirementOnly: guarantees !== null && guarantees.length > 0,
		};
	}

	/** The tab-separated columns the text listing appends to the entry; empty for a source without a plugin. */
	suffix(entry: WorkerSourceEntry): string {
		if (entry.plugin === undefined) {
			return '';
		}
		const { guarantees, workspaces, requirementOnly } = this.describe(entry);
		const shown = guarantees === null ? '(unreadable)' : guarantees.length === 0 ? '(none)' : guarantees.join(', ');
		return (
			`\tguarantees=${shown}` +
			(workspaces === undefined ? '' : `\tworkspaces=${workspaces.join(', ')}`) +
			(requirementOnly ? '\trequirement-only' : '')
		);
	}
}
