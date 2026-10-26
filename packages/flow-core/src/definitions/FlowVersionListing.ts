import { formatStarted, padTruncate } from '../history/ExecutionFormat.js';
import { hashDefinition, shortHashOf } from './DefinitionHash.js';
import type { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';
import { readFlowVersion } from './FlowVersion.js';
import { readRegisteredFlow } from './RegisteredFlowReader.js';
import { compareSemanticVersions } from './SemanticVersion.js';

export interface VersionRow {
	version: string;
	/** First 12 characters of the definition hash. */
	hash: string;
	/** ISO time the snapshot was written; undefined for a registry version that never ran. */
	firstSeen: string | undefined;
	/** A snapshot of this exact content exists. */
	snapshot: boolean;
	/** The registry entry currently holds this exact content. */
	registry: boolean;
	/** The version `flow run <id>` picks. */
	latest: boolean;
}

/** Every version known for a flow id: its snapshots plus the current registry entry, lowest version first. */
export function listFlowVersions(
	store: DefinitionSnapshotStore,
	flowId: string,
	registryFile: string | undefined
): VersionRow[] {
	const rows = new Map<string, VersionRow>();
	for (const known of store.list(flowId)) {
		rows.set(`${known.version}/${known.hash}`, {
			version: known.version,
			hash: known.hash,
			firstSeen: known.firstSeen,
			snapshot: true,
			registry: false,
			latest: false,
		});
	}
	const registered = registryFile === undefined ? undefined : readRegisteredFlow(registryFile, flowId);
	if (registered) {
		const version = readFlowVersion(registered.definition, `the registry entry '${flowId}'`).version;
		const hash = shortHashOf(hashDefinition(registered.definition));
		const key = `${version}/${hash}`;
		const existing = rows.get(key);
		rows.set(
			key,
			existing
				? { ...existing, registry: true }
				: { version, hash, firstSeen: undefined, snapshot: false, registry: true, latest: false }
		);
	}
	const sorted = [...rows.values()].sort((a, b) => compareSemanticVersions(a.version, b.version));
	const last = sorted[sorted.length - 1];
	if (last) {
		last.latest = true;
	}
	return sorted;
}

function whereOf(row: VersionRow): string {
	if (row.snapshot && row.registry) {
		return 'snapshot + registry';
	}
	return row.snapshot ? 'snapshot' : 'registry (not run yet)';
}

/** The table `flow versions <id>` prints. */
export function renderVersionTable(flowId: string, rows: readonly VersionRow[]): string {
	if (rows.length === 0) {
		return (
			`No version of flow '${flowId}' is known: it never ran and is not in the project registry. ` +
			'Run it once from its file: flow run <path>.'
		);
	}
	const lines = [
		padTruncate('VERSION', 16) + padTruncate('DEFINITION', 14) + padTruncate('FIRST SEEN (UTC)', 21) + 'WHERE',
		'-'.repeat(70),
	];
	for (const row of rows) {
		lines.push(
			padTruncate(row.latest ? `${row.version} *` : row.version, 16) +
				padTruncate(row.hash, 14) +
				padTruncate(row.firstSeen === undefined ? '-' : formatStarted(row.firstSeen), 21) +
				whereOf(row)
		);
	}
	lines.push(
		'',
		'* = latest: what `flow run ' + flowId + '` runs. Pin another with `flow run ' + flowId + '@<version>`.'
	);
	return lines.join('\n');
}
