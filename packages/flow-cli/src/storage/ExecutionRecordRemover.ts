import { type ExecutionState, isExecutionId } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PAUSED_SNAPSHOT_SUFFIX } from './PausedRunSnapshotStore';
import { PluginMetaCleaner } from './PluginMetaCleaner';

export interface RemovedRecord {
	executionId: string;
}

export interface NotRemovedRecord {
	executionId: string;
	reason: string;
}

export interface RecordRemoval {
	removed: RemovedRecord[];
	notRemoved: NotRemovedRecord[];
	/** Leftover restart snapshots (`<id>.paused-snapshot`) deleted with their record. */
	snapshotsRemoved: number;
	/** Plugin workspace `.meta` directories deleted with their record (see PluginMetaCleaner for the safety rules). */
	pluginMetaRemoved: number;
}

/**
 * Deletes execution records on request (`flow prune`), as opposed to ExecutionPruner which applies the retention period.
 *
 * Safe next to a running daemon because the store is plain files read on demand (no index, no cache): deleting `<id>.json` is
 * the whole removal. Each record is read again right before it is deleted and `isDeletable` must still accept it, so a run the
 * daemon reopened since the selection (`flow resume` of a failed run) is kept. Side files deleted with a record: only its
 * `<id>.paused-snapshot` (named after the id, never shared) and the plugin `.meta` directory the record names (PluginMetaCleaner:
 * marker, link and live-reference checks). Nothing else is touched.
 */
export class ExecutionRecordRemover {
	constructor(
		private readonly executionsDir: string,
		// The same rule that selected the record: false for anything that is not finished.
		private readonly isDeletable: (record: ExecutionState) => boolean,
		private readonly metaCleaner: PluginMetaCleaner = new PluginMetaCleaner(message =>
			process.stderr.write(`${message}\n`)
		)
	) {}

	/**
	 * @param executionIds - records to delete
	 * @param stillStored - every record that is not being deleted: their plugin `.meta` directories are never removed
	 */
	remove(executionIds: readonly string[], stillStored: readonly ExecutionState[]): RecordRemoval {
		const result: RecordRemoval = { removed: [], notRemoved: [], snapshotsRemoved: 0, pluginMetaRemoved: 0 };
		const metaCandidates: { executionId: string; pluginMetaDir: string }[] = [];
		for (const executionId of executionIds) {
			const outcome = this.removeOne(executionId);
			if (typeof outcome === 'string') {
				result.notRemoved.push({ executionId, reason: outcome });
				continue;
			}
			result.removed.push({ executionId });
			if (this.removeSnapshot(executionId)) {
				result.snapshotsRemoved++;
			}
			if (outcome.pluginMetaDir !== undefined) {
				metaCandidates.push({ executionId, pluginMetaDir: outcome.pluginMetaDir });
			}
		}
		if (metaCandidates.length > 0) {
			const live = stillStored.flatMap(record =>
				record.pluginMetaDir === undefined ? [] : [record.pluginMetaDir]
			);
			const active = stillStored
				.filter(record => !this.isDeletable(record))
				.flatMap(record => (record.pluginMetaDir === undefined ? [] : [record.pluginMetaDir]));
			result.pluginMetaRemoved = this.metaCleaner
				.clean(metaCandidates, live, active)
				.filter(outcome => outcome.result === 'removed').length;
		}
		return result;
	}

	/** The reason it was kept, or what the deleted record said about its plugin `.meta`. */
	private removeOne(executionId: string): string | { pluginMetaDir: string | undefined } {
		if (!isExecutionId(executionId)) {
			return `"${executionId}" is not a valid execution id`;
		}
		const file = path.join(this.executionsDir, `${executionId}.json`);
		let record: ExecutionState;
		try {
			record = JSON.parse(fs.readFileSync(file, 'utf8')) as ExecutionState;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			return code === 'ENOENT'
				? 'the record is already gone'
				: `the record cannot be read again before deletion (${String(err)}); nothing was deleted`;
		}
		if (record.executionId !== executionId) {
			return `${file} holds execution ${JSON.stringify(record.executionId)}, not ${executionId}; left untouched`;
		}
		if (!this.isDeletable(record)) {
			return `its status changed to ${record.status}${record.paused === undefined ? '' : ' (paused)'} since it was selected; it is not finished, so it was kept`;
		}
		try {
			fs.unlinkSync(file);
		} catch (err) {
			return `${file} could not be deleted (${String(err)}). Check that nothing holds the file open and that you may write to the executions directory, then rerun.`;
		}
		return { pluginMetaDir: record.pluginMetaDir };
	}

	private removeSnapshot(executionId: string): boolean {
		const file = path.join(this.executionsDir, `${executionId}${PAUSED_SNAPSHOT_SUFFIX}`);
		try {
			fs.unlinkSync(file);
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				process.stderr.write(
					`[flow] the record of ${executionId} was deleted but ${file} could not be (${String(err)}). Delete it by hand: nothing uses it.\n`
				);
			}
			return false;
		}
	}
}
