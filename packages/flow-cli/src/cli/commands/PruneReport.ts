import type { ExecutionState } from 'flow-core';

import type { PruneRefusal } from './PruneSelector';

export interface PruneItem {
	executionId: string;
	flowId: string;
	status: string;
	startedAt: string;
}

/** The `--json` document of `flow prune` (schema 1): `deleted` after a real run, `wouldDelete` when nothing was deleted. */
export type PruneJson =
	| { schema: 1; dryRun: false; deleted: PruneItem[]; refused: PruneRefusal[] }
	| { schema: 1; dryRun: true; wouldDelete: PruneItem[]; refused: PruneRefusal[] };

export interface PruneOutcome {
	dryRun: boolean;
	/** Deleted (real run) or selected (dry run). */
	items: PruneItem[];
	refused: PruneRefusal[];
	/** Real run only: side files deleted with the records. */
	snapshotsRemoved: number;
	pluginMetaRemoved: number;
}

const NOT_DELETED_NOTE =
	'Left in place, never deleted by flow prune: the daemon logs (shared daily files), and the per-run workspace metadata folder ' +
	'<project>/.flow/runs/<id>.meta (not recorded in the execution; flow prune cannot tell it is safe to delete).';

/** Builds what `flow prune` prints, as text or as its JSON document. */
export class PruneReport {
	static item(record: ExecutionState): PruneItem {
		return {
			executionId: record.executionId,
			flowId: record.flowId,
			status: record.status,
			startedAt: record.startedAt,
		};
	}

	static toJson(outcome: PruneOutcome): PruneJson {
		return outcome.dryRun
			? { schema: 1, dryRun: true, wouldDelete: outcome.items, refused: outcome.refused }
			: { schema: 1, dryRun: false, deleted: outcome.items, refused: outcome.refused };
	}

	/**
	 * @param confirmationMissing - true when the run was a dry run only because `--yes` was not given: the text then says how to delete
	 */
	static renderText(outcome: PruneOutcome, confirmationMissing: boolean): string {
		const lines: string[] = [];
		const count = outcome.items.length;
		if (count === 0) {
			lines.push('No finished execution matches the filters: nothing to delete.');
		} else {
			const verb = outcome.dryRun ? 'Would delete' : 'Deleted';
			lines.push(`${verb} ${count} execution${count === 1 ? '' : 's'}${outcome.dryRun ? ' (dry run)' : ''}:`);
			for (const item of outcome.items) {
				lines.push(`  ${item.executionId}  ${item.flowId}  ${item.status}  ${item.startedAt}`);
			}
		}
		if (outcome.refused.length > 0) {
			const n = outcome.refused.length;
			lines.push(`Not deleted (${n}), these executions were refused:`);
			for (const refusal of outcome.refused) {
				lines.push(`  ${refusal.executionId}  ${refusal.reason}`);
			}
		}
		if (!outcome.dryRun) {
			if (outcome.snapshotsRemoved > 0) {
				lines.push(
					`Also removed ${outcome.snapshotsRemoved} leftover restart snapshot(s) (<id>.paused-snapshot).`
				);
			}
			if (outcome.pluginMetaRemoved > 0) {
				lines.push(
					`Also removed ${outcome.pluginMetaRemoved} plugin workspace metadata folder(s) named by the deleted records.`
				);
			}
			lines.push(NOT_DELETED_NOTE);
		} else if (count > 0) {
			lines.push(
				confirmationMissing
					? 'Nothing deleted, rerun with --yes to delete them.'
					: 'Nothing deleted (--dry-run). Rerun without --dry-run and with --yes to delete them.'
			);
		}
		return lines.join('\n');
	}
}
